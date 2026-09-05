use notations_state_kernel::{MAX_INPUT_BYTES, REQUEST_SCHEMA};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

/// Drain both outputs while feeding input, and kill a stuck subprocess. No
/// shell, external files, network, or persistent state participate in these tests.
fn invoke(input: Vec<u8>) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_notations-state-kernel"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let writer = thread::spawn(move || stdin.write_all(&input));
    let reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take((MAX_INPUT_BYTES + 65_536) as u64)
            .read_to_end(&mut bytes)
            .unwrap();
        bytes
    });
    let errors = thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr.take(65_536).read_to_end(&mut bytes).unwrap();
        bytes
    });
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if started.elapsed() > Duration::from_secs(10) {
            let _ = child.kill();
            let _ = child.wait();
            panic!("State-kernel subprocess exceeded its bounded test timeout");
        }
        thread::sleep(Duration::from_millis(5));
    };
    // Early rejection may close the input pipe before all oversized bytes were sent.
    let _ = writer.join().unwrap();
    Output {
        status,
        stdout: reader.join().unwrap(),
        stderr: errors.join().unwrap(),
    }
}

fn input(commands: Vec<Value>) -> Vec<u8> {
    serde_json::to_vec(&json!({"schema":REQUEST_SCHEMA,"commands":commands})).unwrap()
}

fn parsed(output: &Output) -> Value {
    assert!(output.stderr.is_empty());
    assert!(output.stdout.ends_with(b"\n"));
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn emits_one_exact_success_response_for_empty_replay() {
    let result = invoke(input(vec![]));
    assert!(result.status.success());
    assert_eq!(
        parsed(&result),
        json!({"ok":true,"state":{"schema":"notations.notation-state.v1",
        "revision":0,"notations":[],"relations":[],"canUndo":false,"canRedo":false}})
    );
    assert_eq!(
        result.stdout.iter().filter(|byte| **byte == b'\n').count(),
        1
    );
}

#[test]
fn fresh_process_replay_is_byte_identical_with_history_flags() {
    let request = input(vec![
        json!({"commandId":"c1","kind":"CREATE_NOTATION","notation":{"id":"n1","title":"Before","body":""}}),
        json!({"commandId":"c2","kind":"UPDATE_NOTATION","notationId":"n1","title":"After","body":"A body"}),
        json!({"commandId":"c3","kind":"UNDO"}),
    ]);
    let one = invoke(request.clone());
    let two = invoke(request);
    assert!(one.status.success() && two.status.success());
    assert_eq!(one.stdout, two.stdout);
    assert_eq!(
        parsed(&one)["state"],
        json!({"schema":"notations.notation-state.v1","revision":3,
        "notations":[{"id":"n1","title":"Before","body":""}],"relations":[],"canUndo":true,"canRedo":true})
    );
}

#[test]
fn command_failure_exits_one_without_partial_state_or_source_text() {
    let result = invoke(input(vec![
        json!({"commandId":"c1","kind":"CREATE_NOTATION","notation":{"id":"n1","title":"Secret title","body":"Sensitive text"}}),
        json!({"commandId":"c2","kind":"UPDATE_NOTATION","notationId":"n1","title":"Secret title","body":"Sensitive text"}),
    ]));
    assert_eq!(result.status.code(), Some(1));
    let body = parsed(&result);
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "NO_CHANGE");
    assert!(body.get("state").is_none());
    assert!(!String::from_utf8(result.stdout)
        .unwrap()
        .contains("Sensitive"));
}

#[test]
fn refuses_unknown_fields_and_multiple_json_documents() {
    for request in [
        br#"{"schema":"notations.state-kernel-request.v1","commands":[],"root":"private/path"}"#
            .to_vec(),
        b"{} {}".to_vec(),
        vec![0xff],
    ] {
        let result = invoke(request);
        assert_eq!(result.status.code(), Some(1));
        assert_eq!(parsed(&result)["error"]["code"], "INVALID_REQUEST");
        assert!(!String::from_utf8(result.stdout)
            .unwrap()
            .contains("private/path"));
    }
}

#[test]
fn oversized_stdin_fails_with_bounded_fixed_output() {
    let result = invoke(vec![b' '; MAX_INPUT_BYTES + 1]);
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(parsed(&result)["error"]["code"], "INPUT_TOO_LARGE");
    assert!(result.stdout.len() < 300);
}

#[test]
fn exact_input_byte_boundary_is_accepted() {
    let mut request = input(vec![]);
    request.resize(MAX_INPUT_BYTES, b' ');
    let result = invoke(request);
    assert!(result.status.success());
    assert_eq!(parsed(&result)["state"]["revision"], 0);
}
