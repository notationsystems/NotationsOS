use notations_state_kernel::{
    execute_json, Response, INPUT_READ_FAILED, INPUT_TOO_LARGE, MAX_INPUT_BYTES,
};
use std::io::{self, Read, Write};
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut input = Vec::new();
    let response = match io::stdin()
        .lock()
        .take((MAX_INPUT_BYTES + 1) as u64)
        .read_to_end(&mut input)
    {
        Err(_) => Response::failure(INPUT_READ_FAILED),
        Ok(_) if input.len() > MAX_INPUT_BYTES => Response::failure(INPUT_TOO_LARGE),
        Ok(_) => execute_json(&input),
    };
    let successful = response.is_ok();
    let output = io::stdout();
    let mut locked = output.lock();
    if serde_json::to_writer(&mut locked, &response).is_err()
        || locked.write_all(b"\n").is_err()
        || locked.flush().is_err()
    {
        return ExitCode::FAILURE;
    }
    if successful {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
