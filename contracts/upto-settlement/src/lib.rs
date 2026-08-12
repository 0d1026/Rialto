#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, panic_with_error, token, Address, BytesN, Env, IntoVal,
};

#[contract]
pub struct UptoSettlement;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SettlementError {
    NotYetValid = 1,
    Expired = 2,
    InvalidAmount = 3,
}

#[contractimpl]
impl UptoSettlement {
    /// Settles one single-use x402 `upto` authorization.
    ///
    /// Every argument except `amount` is bound into the payer's Soroban
    /// authorization entry. The final charge may therefore vary from zero to
    /// `max_amount` without changing the signed authorization tree.
    #[allow(clippy::too_many_arguments)]
    pub fn settle(
        env: Env,
        from: Address,
        pay_to: Address,
        asset: Address,
        max_amount: i128,
        valid_after: u64,
        deadline: u64,
        expiration_ledger: u32,
        salt: BytesN<32>,
        auto_revoke: bool,
        amount: i128,
    ) -> i128 {
        // The final settlement amount is deliberately excluded. All remaining
        // payment authority is fixed by the signed root invocation.
        from.require_auth_for_args(
            (
                pay_to.clone(),
                asset.clone(),
                max_amount,
                valid_after,
                deadline,
                expiration_ledger,
                salt,
                auto_revoke,
            )
                .into_val(&env),
        );

        let now = env.ledger().timestamp();
        if now < valid_after {
            panic_with_error!(&env, SettlementError::NotYetValid);
        }
        if now >= deadline {
            panic_with_error!(&env, SettlementError::Expired);
        }
        if max_amount <= 0 || amount < 0 || amount > max_amount {
            panic_with_error!(&env, SettlementError::InvalidAmount);
        }

        let settlement_address = env.current_contract_address();
        let token = token::TokenClient::new(&env, &asset);

        // The payer's signed tree authorizes this exact allowance grant.
        token.approve(&from, &settlement_address, &max_amount, &expiration_ledger);

        // The settlement contract is both invoker and spender, so the host
        // satisfies the spender authorization without another payer signature.
        if amount > 0 {
            token.transfer_from(&settlement_address, &from, &pay_to, &amount);
        }

        // Clear any unused authority in the same atomic invocation when the
        // client requested cleanup. A fully consumed allowance is already zero.
        if auto_revoke && amount < max_amount {
            token.approve(&from, &settlement_address, &0, &0);
        }

        amount
    }
}

#[cfg(test)]
mod test;
