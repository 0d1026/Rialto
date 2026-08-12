extern crate std;

use super::{SettlementError, UptoSettlement, UptoSettlementClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, IntoVal,
};

const NOW: u64 = 1_000;
const VALID_AFTER: u64 = 900;
const DEADLINE: u64 = 1_100;
const EXPIRATION_LEDGER: u32 = 120;
const MAX_AMOUNT: i128 = 1_000;
const PARTIAL_AMOUNT: i128 = 400;

struct Fixture {
    env: Env,
    contract: Address,
    client: UptoSettlementClient<'static>,
    token: TokenClient<'static>,
    asset: Address,
    payer: Address,
    recipient: Address,
    salt: BytesN<32>,
}

impl Fixture {
    fn new() -> Self {
        let env = Env::default();
        env.ledger().set_sequence_number(100);
        env.ledger().set_timestamp(NOW);
        env.mock_all_auths();

        let contract = env.register(UptoSettlement, ());
        let client = UptoSettlementClient::new(&env, &contract);

        let admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let recipient = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(admin);
        let asset = sac.address();
        let token = TokenClient::new(&env, &asset);
        StellarAssetClient::new(&env, &asset).mint(&payer, &MAX_AMOUNT);

        Self {
            env: env.clone(),
            contract,
            client,
            token,
            asset,
            payer,
            recipient,
            salt: BytesN::from_array(&env, &[7; 32]),
        }
    }

    fn settle(&self, amount: i128, auto_revoke: bool) -> i128 {
        self.settle_with(MAX_AMOUNT, VALID_AFTER, DEADLINE, amount, auto_revoke)
    }

    fn settle_with(
        &self,
        max_amount: i128,
        valid_after: u64,
        deadline: u64,
        amount: i128,
        auto_revoke: bool,
    ) -> i128 {
        self.client.settle(
            &self.payer,
            &self.recipient,
            &self.asset,
            &max_amount,
            &valid_after,
            &deadline,
            &EXPIRATION_LEDGER,
            &self.salt,
            &auto_revoke,
            &amount,
        )
    }

    fn assert_contract_error(
        &self,
        max_amount: i128,
        valid_after: u64,
        deadline: u64,
        amount: i128,
        expected: SettlementError,
    ) {
        assert_eq!(
            self.client.try_settle(
                &self.payer,
                &self.recipient,
                &self.asset,
                &max_amount,
                &valid_after,
                &deadline,
                &EXPIRATION_LEDGER,
                &self.salt,
                &true,
                &amount,
            ),
            Err(Ok(soroban_sdk::Error::from_contract_error(expected as u32)))
        );
    }
}

// The module hierarchy mirrors tests/settle.tree. Bulloak generates Solidity,
// so the BTT specification is mapped to Rust modules and focused tests by hand.

mod authorization {
    use super::*;

    #[test]
    fn rejects_when_payer_authorization_is_missing() {
        let fixture = Fixture::new();
        fixture.env.set_auths(&[]);

        assert!(fixture
            .client
            .try_settle(
                &fixture.payer,
                &fixture.recipient,
                &fixture.asset,
                &MAX_AMOUNT,
                &VALID_AFTER,
                &DEADLINE,
                &EXPIRATION_LEDGER,
                &fixture.salt,
                &true,
                &0,
            )
            .is_err());
    }

    #[test]
    fn given_g_account_records_authorization_for_the_g_account() {
        let env = Env::default();
        env.ledger().set_sequence_number(100);
        env.ledger().set_timestamp(NOW);
        env.mock_all_auths();

        let contract = env.register(UptoSettlement, ());
        let client = UptoSettlementClient::new(&env, &contract);
        let payer = Address::from_str(
            &env,
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        );
        let recipient = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();

        assert_eq!(
            client.settle(
                &payer,
                &recipient,
                &asset,
                &MAX_AMOUNT,
                &VALID_AFTER,
                &DEADLINE,
                &EXPIRATION_LEDGER,
                &BytesN::from_array(&env, &[9; 32]),
                &true,
                &0,
            ),
            0
        );
        assert_eq!(env.auths()[0].0, payer);
    }

    #[test]
    fn given_c_account_records_authorization_for_the_c_account() {
        let fixture = Fixture::new();

        fixture.settle(0, true);

        assert_eq!(fixture.env.auths()[0].0, fixture.payer);
    }

    #[test]
    fn recorded_tree_excludes_amount_and_binds_root_and_approval_arguments() {
        let fixture = Fixture::new();

        fixture.settle(PARTIAL_AMOUNT, true);

        assert_eq!(
            fixture.env.auths(),
            [(
                fixture.payer.clone(),
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        fixture.contract.clone(),
                        symbol_short!("settle"),
                        (
                            fixture.recipient.clone(),
                            fixture.asset.clone(),
                            MAX_AMOUNT,
                            VALID_AFTER,
                            DEADLINE,
                            EXPIRATION_LEDGER,
                            fixture.salt.clone(),
                            true,
                        )
                            .into_val(&fixture.env),
                    )),
                    sub_invocations: std::vec![
                        AuthorizedInvocation {
                            function: AuthorizedFunction::Contract((
                                fixture.asset.clone(),
                                symbol_short!("approve"),
                                (
                                    fixture.payer.clone(),
                                    fixture.contract.clone(),
                                    MAX_AMOUNT,
                                    EXPIRATION_LEDGER,
                                )
                                    .into_val(&fixture.env),
                            )),
                            sub_invocations: std::vec![],
                        },
                        AuthorizedInvocation {
                            function: AuthorizedFunction::Contract((
                                fixture.asset.clone(),
                                symbol_short!("approve"),
                                (
                                    fixture.payer.clone(),
                                    fixture.contract.clone(),
                                    0_i128,
                                    0_u32,
                                )
                                    .into_val(&fixture.env),
                            )),
                            sub_invocations: std::vec![],
                        },
                    ],
                },
            )]
        );
    }
}

mod time_window {
    use super::*;

    #[test]
    fn before_valid_after_returns_not_yet_valid() {
        let fixture = Fixture::new();
        fixture.env.ledger().set_timestamp(VALID_AFTER - 1);

        fixture.assert_contract_error(
            MAX_AMOUNT,
            VALID_AFTER,
            DEADLINE,
            0,
            SettlementError::NotYetValid,
        );
    }

    #[test]
    fn at_valid_after_allows_settlement() {
        let fixture = Fixture::new();
        fixture.env.ledger().set_timestamp(VALID_AFTER);

        assert_eq!(fixture.settle(0, true), 0);
    }

    #[test]
    fn at_deadline_returns_expired() {
        let fixture = Fixture::new();
        fixture.env.ledger().set_timestamp(DEADLINE);

        fixture.assert_contract_error(
            MAX_AMOUNT,
            VALID_AFTER,
            DEADLINE,
            0,
            SettlementError::Expired,
        );
    }

    #[test]
    fn after_deadline_returns_expired() {
        let fixture = Fixture::new();
        fixture.env.ledger().set_timestamp(DEADLINE + 1);

        fixture.assert_contract_error(
            MAX_AMOUNT,
            VALID_AFTER,
            DEADLINE,
            0,
            SettlementError::Expired,
        );
    }
}

mod amount_validation {
    use super::*;

    #[test]
    fn zero_max_amount_returns_invalid_amount() {
        let fixture = Fixture::new();

        fixture.assert_contract_error(0, VALID_AFTER, DEADLINE, 0, SettlementError::InvalidAmount);
    }

    #[test]
    fn negative_max_amount_returns_invalid_amount() {
        let fixture = Fixture::new();

        fixture.assert_contract_error(-1, VALID_AFTER, DEADLINE, 0, SettlementError::InvalidAmount);
    }

    #[test]
    fn negative_amount_returns_invalid_amount() {
        let fixture = Fixture::new();

        fixture.assert_contract_error(
            MAX_AMOUNT,
            VALID_AFTER,
            DEADLINE,
            -1,
            SettlementError::InvalidAmount,
        );
    }

    #[test]
    fn amount_above_max_amount_returns_invalid_amount() {
        let fixture = Fixture::new();

        fixture.assert_contract_error(
            MAX_AMOUNT,
            VALID_AFTER,
            DEADLINE,
            MAX_AMOUNT + 1,
            SettlementError::InvalidAmount,
        );
    }
}

mod zero_amount {
    use super::*;

    #[test]
    fn auto_revoke_returns_zero() {
        let fixture = Fixture::new();

        assert_eq!(fixture.settle(0, true), 0);
    }

    #[test]
    fn auto_revoke_leaves_balances_unchanged() {
        let fixture = Fixture::new();

        fixture.settle(0, true);

        assert_eq!(fixture.token.balance(&fixture.payer), MAX_AMOUNT);
        assert_eq!(fixture.token.balance(&fixture.recipient), 0);
    }

    #[test]
    fn auto_revoke_clears_allowance() {
        let fixture = Fixture::new();

        fixture.settle(0, true);

        assert_eq!(
            fixture.token.allowance(&fixture.payer, &fixture.contract),
            0
        );
    }

    #[test]
    fn without_auto_revoke_preserves_full_allowance() {
        let fixture = Fixture::new();

        fixture.settle(0, false);

        assert_eq!(
            fixture.token.allowance(&fixture.payer, &fixture.contract),
            MAX_AMOUNT
        );
    }
}

mod partial_amount {
    use super::*;

    #[test]
    fn auto_revoke_transfers_requested_amount() {
        let fixture = Fixture::new();

        assert_eq!(fixture.settle(PARTIAL_AMOUNT, true), PARTIAL_AMOUNT);
        assert_eq!(
            fixture.token.balance(&fixture.payer),
            MAX_AMOUNT - PARTIAL_AMOUNT
        );
        assert_eq!(fixture.token.balance(&fixture.recipient), PARTIAL_AMOUNT);
    }

    #[test]
    fn auto_revoke_clears_remaining_allowance() {
        let fixture = Fixture::new();

        fixture.settle(PARTIAL_AMOUNT, true);

        assert_eq!(
            fixture.token.allowance(&fixture.payer, &fixture.contract),
            0
        );
    }

    #[test]
    fn without_auto_revoke_transfers_requested_amount() {
        let fixture = Fixture::new();

        assert_eq!(fixture.settle(PARTIAL_AMOUNT, false), PARTIAL_AMOUNT);
        assert_eq!(
            fixture.token.balance(&fixture.payer),
            MAX_AMOUNT - PARTIAL_AMOUNT
        );
        assert_eq!(fixture.token.balance(&fixture.recipient), PARTIAL_AMOUNT);
    }

    #[test]
    fn without_auto_revoke_preserves_remaining_allowance() {
        let fixture = Fixture::new();

        fixture.settle(PARTIAL_AMOUNT, false);

        assert_eq!(
            fixture.token.allowance(&fixture.payer, &fixture.contract),
            MAX_AMOUNT - PARTIAL_AMOUNT
        );
    }
}

mod full_amount {
    use super::*;

    fn assert_full_settlement(auto_revoke: bool) {
        let fixture = Fixture::new();

        assert_eq!(fixture.settle(MAX_AMOUNT, auto_revoke), MAX_AMOUNT);
        assert_eq!(fixture.token.balance(&fixture.payer), 0);
        assert_eq!(fixture.token.balance(&fixture.recipient), MAX_AMOUNT);
        assert_eq!(
            fixture.token.allowance(&fixture.payer, &fixture.contract),
            0
        );
    }

    #[test]
    fn auto_revoke_transfers_maximum_and_leaves_no_allowance() {
        assert_full_settlement(true);
    }

    #[test]
    fn without_auto_revoke_transfers_maximum_and_leaves_no_allowance() {
        assert_full_settlement(false);
    }
}
