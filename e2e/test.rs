#![cfg(test)]

use super::*;
use soroban_sdk::{
    events::Event,
    testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    vec,
    xdr::{ContractExecutable, LedgerEntryData, ScAddress, ScVal},
    Address, Bytes, BytesN, Env, IntoVal, String, Symbol,
};

/// Register the contract and return its client plus a funded admin address.
fn setup(env: &Env) -> (ShowcaseClient<'static>, Address) {
    env.mock_all_auths();
    let contract_id = env.register(Showcase, ());
    let client = ShowcaseClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.init(&admin);
    (client, admin)
}

#[test]
fn init_sets_admin_and_zeroes_the_counter() {
    let env = Env::default();
    let (client, admin) = setup(&env);

    assert_eq!(client.admin(), admin);
    assert_eq!(client.stats().counter, 0);
}

#[test]
fn init_is_rejected_twice() {
    let env = Env::default();
    let (client, _) = setup(&env);

    let other = Address::generate(&env);
    assert_eq!(client.try_init(&other), Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn reads_before_init_report_not_initialized() {
    let env = Env::default();
    let contract_id = env.register(Showcase, ());
    let client = ShowcaseClient::new(&env, &contract_id);

    assert_eq!(client.try_admin(), Err(Ok(Error::NotInitialized)));
    assert_eq!(client.try_stats(), Err(Ok(Error::NotInitialized)));
}

#[test]
fn bump_accumulates_and_saturates() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(client.bump(&1), 1);
    assert_eq!(client.bump(&10), 11);

    // The release profile turns on overflow checks, so the counter has to
    // saturate rather than panic on a hostile argument.
    assert_eq!(client.bump(&u32::MAX), u32::MAX);
    assert_eq!(client.bump(&5), u32::MAX);
}

#[test]
fn notes_are_versioned_per_name() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let author = Address::generate(&env);

    let hello = Symbol::new(&env, "hello");
    let other = Symbol::new(&env, "other");

    assert_eq!(
        client.put_note(&author, &hello, &String::from_str(&env, "first")),
        1
    );
    assert_eq!(
        client.put_note(&author, &hello, &String::from_str(&env, "second")),
        2
    );
    // A different name is a different entry, not a revision of the first.
    assert_eq!(
        client.put_note(&author, &other, &String::from_str(&env, "elsewhere")),
        1
    );

    let note = client.note(&hello);
    assert_eq!(note.revision, 2);
    assert_eq!(note.body, String::from_str(&env, "second"));
    assert_eq!(note.author, author);
}

#[test]
fn an_oversized_note_is_rejected() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let author = Address::generate(&env);

    // MAX_NOTE_LEN + 1 bytes.
    let body = String::from_str(&env, core::str::from_utf8(&[b'x'; 201]).unwrap());
    assert_eq!(
        client.try_put_note(&author, &Symbol::new(&env, "big"), &body),
        Err(Ok(Error::NoteTooLong))
    );
}

#[test]
fn a_note_at_the_length_limit_is_accepted() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let author = Address::generate(&env);

    let body = String::from_str(&env, core::str::from_utf8(&[b'x'; 200]).unwrap());
    assert_eq!(
        client.put_note(&author, &Symbol::new(&env, "edge"), &body),
        1
    );
}

#[test]
fn put_note_requires_the_authors_authorization() {
    let env = Env::default();
    let contract_id = env.register(Showcase, ());
    let client = ShowcaseClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    env.mock_all_auths();
    client.init(&admin);

    // Replace the blanket mock with an empty allow-list: require_auth must now
    // reject the call rather than let it write.
    env.mock_auths(&[]);
    let author = Address::generate(&env);
    assert!(client
        .try_put_note(
            &author,
            &Symbol::new(&env, "nope"),
            &String::from_str(&env, "x")
        )
        .is_err());
}

#[test]
fn missing_notes_report_no_such_note() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(
        client.try_note(&Symbol::new(&env, "ghost")),
        Err(Ok(Error::NoSuchNote))
    );
    assert_eq!(
        client.try_delete_note(&Symbol::new(&env, "ghost")),
        Err(Ok(Error::NoSuchNote))
    );
}

#[test]
fn delete_note_removes_the_entry() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let author = Address::generate(&env);
    let name = Symbol::new(&env, "doomed");

    client.put_note(&author, &name, &String::from_str(&env, "here"));
    client.delete_note(&name);

    assert_eq!(client.try_note(&name), Err(Ok(Error::NoSuchNote)));
    // Deleting frees the name, so the next write starts over at revision 1.
    assert_eq!(
        client.put_note(&author, &name, &String::from_str(&env, "again")),
        1
    );
}

#[test]
fn revisions_reports_known_notes_and_skips_unknown_ones() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let author = Address::generate(&env);

    let a = Symbol::new(&env, "a");
    let b = Symbol::new(&env, "b");
    client.put_note(&author, &a, &String::from_str(&env, "one"));
    client.put_note(&author, &a, &String::from_str(&env, "two"));
    client.put_note(&author, &b, &String::from_str(&env, "one"));

    let map = client.revisions(&vec![
        &env,
        a.clone(),
        b.clone(),
        Symbol::new(&env, "missing"),
    ]);
    assert_eq!(map.len(), 2);
    assert_eq!(map.get(a), Some(2));
    assert_eq!(map.get(b), Some(1));
}

#[test]
fn collections_are_stored_as_persistent_vec_and_map_entries() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let values = vec![&env, 7i128, 11i128, 13i128];
    let mut labels = Map::new(&env);
    labels.set(
        Symbol::new(&env, "purpose"),
        String::from_str(&env, "showcase"),
    );

    client.store_collections(&values, &labels);

    assert_eq!(client.stored_values(), values);
    assert_eq!(client.stored_labels(), labels);
    env.as_contract(&client.address, || {
        assert!(env.storage().persistent().has(&DataKey::Values));
        assert!(env.storage().persistent().has(&DataKey::Labels));
    });
}

#[test]
fn sessions_expire_on_their_own() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let who = Address::generate(&env);

    client.start_session(&who, &100);
    assert!(client.session(&who).is_some());

    // Temporary entries are the one durability that vanishes without anyone
    // deleting them — which is the whole reason Prism distinguishes them.
    env.ledger().with_mut(|l| l.sequence_number += 101);
    assert_eq!(client.session(&who), None);
}

#[test]
fn a_zero_ledger_session_is_clamped_rather_than_rejected() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let who = Address::generate(&env);

    client.start_session(&who, &0);
    assert!(client.session(&who).is_some());
}

#[test]
fn session_is_none_for_an_address_that_never_had_one() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(client.session(&Address::generate(&env)), None);
}

#[test]
fn tally_sums_i128_and_saturates() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(client.tally(&vec![&env, 1i128, 2i128, 3i128]), 6);
    assert_eq!(client.tally(&vec![&env]), 0);
    // Values past 2^53 are exactly where a JavaScript decoder would start
    // lying, so the contract has to be able to produce them.
    assert_eq!(client.tally(&vec![&env, i128::MAX, 1i128]), i128::MAX);
}

#[test]
fn checksum_xors_every_byte() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(
        client.checksum(&Bytes::from_array(&env, &[0x0f, 0xf0])),
        0xff
    );
    assert_eq!(client.checksum(&Bytes::new(&env)), 0);
}

#[test]
fn stats_reports_the_contracts_own_address() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Showcase, ());
    let client = ShowcaseClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.init(&admin);

    let stats = client.stats();
    assert_eq!(stats.contract, contract_id);
    assert_eq!(stats.admin, admin);
}

#[test]
fn boom_always_fails() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(client.try_boom(), Err(Ok(Error::Deliberate)));
}

#[test]
fn a_published_event_matches_its_declared_type() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let author = Address::generate(&env);
    let name = Symbol::new(&env, "topical");

    client.put_note(&author, &name, &String::from_str(&env, "body"));

    // Comparing against the event struct's own XDR checks the topic list and
    // the data payload together, so it fails if #[topic] placement drifts away
    // from what the contract spec advertises.
    let expected = NoteWritten {
        name,
        author,
        revision: 1,
    }
    .to_xdr(&env, &client.address);

    let emitted = env.events().all();
    assert_eq!(emitted.events().last(), Some(&expected));
}

#[test]
fn an_event_with_no_indexed_fields_carries_only_its_name_topic() {
    let env = Env::default();
    let (client, _) = setup(&env);

    client.bump(&3);

    let expected = Bumped { counter: 3 }.to_xdr(&env, &client.address);
    let emitted = env.events().all();
    assert_eq!(emitted.events().iter().rev().nth(1), Some(&expected));
}

#[test]
fn vec_format_event_matches_its_declared_type() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let values = vec![&env, 2i128, 4i128, 8i128];

    assert_eq!(client.tally(&values), 14);

    let expected = AmountsTallied {
        count: 3,
        total: 14,
    }
    .to_xdr(&env, &client.address);
    let emitted = env.events().all();
    assert_eq!(emitted.events().last(), Some(&expected));
}

#[test]
fn single_value_event_matches_its_declared_type() {
    let env = Env::default();
    let (client, _) = setup(&env);

    assert_eq!(client.bump(&42), 42);

    let expected = CounterValue { counter: 42 }.to_xdr(&env, &client.address);
    let emitted = env.events().all();
    assert_eq!(emitted.events().last(), Some(&expected));
}

// ── upgrade ─────────────────────────────────────────────────────────────────

/// A minimal Wasm module the host accepts as contract code: a
/// `contractenvmetav0` section declaring the current protocol (the same
/// interface-version entry `soroban-sdk` writes into every contract), plus a
/// marker section so each fixture has its own hash. It exports nothing, so the
/// tests inspect the upgraded contract's executable instead of calling it.
fn fixture_wasm(env: &Env, marker: u8) -> Bytes {
    let protocol = env.ledger().protocol_version().to_be_bytes();
    let mut wasm = Bytes::from_slice(env, b"\0asm\x01\0\0\0");
    // Custom section: id 0, 30 bytes, name "contractenvmetav0" (17 bytes),
    // then ScEnvMetaEntry::InterfaceVersion { protocol, pre_release: 0 } as XDR.
    wasm.extend_from_slice(&[0x00, 30, 17]);
    wasm.extend_from_slice(b"contractenvmetav0");
    wasm.extend_from_slice(&[0, 0, 0, 0]);
    wasm.extend_from_slice(&protocol);
    wasm.extend_from_slice(&[0, 0, 0, 0]);
    // Custom section: id 0, 8 bytes, name "marker" (6 bytes), one marker byte.
    wasm.extend_from_slice(&[0x00, 8, 6]);
    wasm.extend_from_slice(b"marker");
    wasm.push_back(marker);
    wasm
}

/// The Wasm hash the ledger records as `contract`'s executable: the value
/// Prism's indexer reads back as `__wasm_hash__`.
fn executable_wasm_hash(env: &Env, contract: &Address) -> Option<[u8; 32]> {
    let target = ScAddress::from(contract);
    env.to_ledger_snapshot()
        .ledger_entries
        .iter()
        .find_map(|(_, (entry, _))| match &entry.data {
            LedgerEntryData::ContractData(data)
                if data.contract == target && data.key == ScVal::LedgerKeyContractInstance =>
            {
                match &data.val {
                    ScVal::ContractInstance(instance) => match &instance.executable {
                        ContractExecutable::Wasm(hash) => Some(hash.0),
                        ContractExecutable::StellarAsset => None,
                    },
                    _ => None,
                }
            }
            _ => None,
        })
}

#[test]
fn the_admin_can_upgrade_the_contract_wasm() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let new_wasm_hash = env.deployer().upload_contract_wasm(fixture_wasm(&env, 1));
    assert_ne!(
        executable_wasm_hash(&env, &client.address),
        Some(new_wasm_hash.to_array())
    );

    client.upgrade(&new_wasm_hash);

    // Exactly one authorization was needed, and it was the admin's.
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);

    let expected = Upgraded {
        admin,
        new_wasm_hash: new_wasm_hash.clone(),
    }
    .to_xdr(&env, &client.address);
    assert_eq!(env.events().all().events().last(), Some(&expected));

    // Same address, new executable.
    assert_eq!(
        executable_wasm_hash(&env, &client.address),
        Some(new_wasm_hash.to_array())
    );
}

#[test]
fn an_upgrade_without_any_authorization_is_rejected() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let new_wasm_hash = env.deployer().upload_contract_wasm(fixture_wasm(&env, 2));
    let before = executable_wasm_hash(&env, &client.address);

    env.mock_auths(&[]);
    assert!(client.try_upgrade(&new_wasm_hash).is_err());
    assert_eq!(executable_wasm_hash(&env, &client.address), before);
}

#[test]
fn an_upgrade_signed_by_anyone_but_the_admin_is_rejected() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let new_wasm_hash = env.deployer().upload_contract_wasm(fixture_wasm(&env, 3));
    let before = executable_wasm_hash(&env, &client.address);

    // The stranger signs exactly this call; the contract still demands the admin.
    let stranger = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "upgrade",
            args: (new_wasm_hash.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_upgrade(&new_wasm_hash).is_err());
    assert_eq!(executable_wasm_hash(&env, &client.address), before);
}

#[test]
fn upgrading_to_wasm_that_was_never_uploaded_fails() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let before = executable_wasm_hash(&env, &client.address);

    let unknown = BytesN::from_array(&env, &[7u8; 32]);
    assert!(client.try_upgrade(&unknown).is_err());
    assert_eq!(executable_wasm_hash(&env, &client.address), before);
}

#[test]
fn upgrade_before_init_reports_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Showcase, ());
    let client = ShowcaseClient::new(&env, &contract_id);
    let new_wasm_hash = env.deployer().upload_contract_wasm(fixture_wasm(&env, 4));

    assert_eq!(
        client.try_upgrade(&new_wasm_hash),
        Err(Ok(Error::NotInitialized))
    );
}
