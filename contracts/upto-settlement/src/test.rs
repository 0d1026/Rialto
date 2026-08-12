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
        let salt = BytesN::from_array(&env, &[7; 32]);

        Self {
            env,
            contract,
            client,
            token,
            asset,
            payer,
            recipient,
            salt,
        }
    }

    fn settle(&self, amount: i128, auto_revoke: bool) -> i128 {
        self.client.settle(
            &self.payer,
            &self.recipient,
            &self.asset,
            &MAX_AMOUNT,
            &VALID_AFTER,
            &DEADLINE,
            &EXPIRATION_LEDGER,
            &self.salt,
            &auto_revoke,
            &amount,
        )
    }
}

#[test]
fn settles_partial_amount_from_c_account_and_revokes_remainder() {
    let fixture = Fixture::new();

    assert_eq!(fixture.settle(400, true), 400);
    assert_eq!(fixture.token.balance(&fixture.payer), 600);
    assert_eq!(fixture.token.balance(&fixture.recipient), 400);
    assert_eq!(
        fixture.token.allowance(&fixture.payer, &fixture.contract),
        0
    );
}

#[test]
fn preserves_remainder_when_auto_revoke_is_false() {
    let fixture = Fixture::new();

    assert_eq!(fixture.settle(400, false), 400);
    assert_eq!(fixture.token.balance(&fixture.payer), 600);
    assert_eq!(fixture.token.balance(&fixture.recipient), 400);
    assert_eq!(
        fixture.token.allowance(&fixture.payer, &fixture.contract),
        600
    );
}

#[test]
fn zero_amount_consumes_the_call_without_moving_tokens() {
    let fixture = Fixture::new();

    assert_eq!(fixture.settle(0, true), 0);
    assert_eq!(fixture.token.balance(&fixture.payer), MAX_AMOUNT);
    assert_eq!(fixture.token.balance(&fixture.recipient), 0);
    assert_eq!(
        fixture.token.allowance(&fixture.payer, &fixture.contract),
        0
    );
}

#[test]
fn accepts_a_g_account_payer_address() {
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
fn authorization_tree_excludes_amount_and_binds_approvals() {
    let fixture = Fixture::new();

    fixture.settle(400, true);

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

#[test]
fn rejects_calls_outside_the_time_window() {
    let fixture = Fixture::new();

    fixture.env.ledger().set_timestamp(VALID_AFTER - 1);
    assert_eq!(
        fixture.client.try_settle(
            &fixture.payer,
            &fixture.recipient,
            &fixture.asset,
            &MAX_AMOUNT,
            &VALID_AFTER,
            &DEADLINE,
            &EXPIRATION_LEDGER,
            &fixture.salt,
            &true,
            &1,
        ),
        Err(Ok(soroban_sdk::Error::from_contract_error(
            SettlementError::NotYetValid as u32,
        )))
    );

    fixture.env.ledger().set_timestamp(DEADLINE);
    assert_eq!(
        fixture.client.try_settle(
            &fixture.payer,
            &fixture.recipient,
            &fixture.asset,
            &MAX_AMOUNT,
            &VALID_AFTER,
            &DEADLINE,
            &EXPIRATION_LEDGER,
            &fixture.salt,
            &true,
            &1,
        ),
        Err(Ok(soroban_sdk::Error::from_contract_error(
            SettlementError::Expired as u32,
        )))
    );
}

#[test]
fn rejects_invalid_amounts() {
    let fixture = Fixture::new();

    for amount in [-1, MAX_AMOUNT + 1] {
        assert_eq!(
            fixture.client.try_settle(
                &fixture.payer,
                &fixture.recipient,
                &fixture.asset,
                &MAX_AMOUNT,
                &VALID_AFTER,
                &DEADLINE,
                &EXPIRATION_LEDGER,
                &fixture.salt,
                &true,
                &amount,
            ),
            Err(Ok(soroban_sdk::Error::from_contract_error(
                SettlementError::InvalidAmount as u32,
            )))
        );
    }
}
