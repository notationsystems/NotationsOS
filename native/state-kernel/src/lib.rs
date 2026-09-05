//! Deterministic replay from empty state. This crate owns no files, network,
//! clocks, renderer, or persistence; callers supply the complete accepted history.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const REQUEST_SCHEMA: &str = "notations.state-kernel-request.v1";
pub const STATE_SCHEMA: &str = "notations.notation-state.v1";
pub const MAX_INPUT_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_COMMANDS: usize = 256;
pub const MAX_NOTATIONS: usize = 64;
pub const MAX_RELATIONS: usize = 128;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Notation {
    pub id: String,
    pub title: String,
    pub body: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Relation {
    pub id: String,
    pub from: String,
    pub to: String,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum Command {
    #[serde(rename = "CREATE_NOTATION")]
    CreateNotation {
        #[serde(rename = "commandId")]
        command_id: String,
        notation: Notation,
    },
    #[serde(rename = "UPDATE_NOTATION")]
    UpdateNotation {
        #[serde(rename = "commandId")]
        command_id: String,
        #[serde(rename = "notationId")]
        notation_id: String,
        title: String,
        body: String,
    },
    #[serde(rename = "CREATE_RELATION")]
    CreateRelation {
        #[serde(rename = "commandId")]
        command_id: String,
        relation: Relation,
    },
    #[serde(rename = "UNDO")]
    Undo {
        #[serde(rename = "commandId")]
        command_id: String,
    },
    #[serde(rename = "REDO")]
    Redo {
        #[serde(rename = "commandId")]
        command_id: String,
    },
}

impl Command {
    fn id(&self) -> &str {
        match self {
            Self::CreateNotation { command_id, .. }
            | Self::UpdateNotation { command_id, .. }
            | Self::CreateRelation { command_id, .. }
            | Self::Undo { command_id }
            | Self::Redo { command_id } => command_id,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub schema: String,
    pub commands: Vec<Command>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotationState {
    pub schema: &'static str,
    pub revision: usize,
    pub notations: Vec<Notation>,
    pub relations: Vec<Relation>,
    pub can_undo: bool,
    pub can_redo: bool,
}

/// Errors never interpolate source text, identifiers, paths, or JSON parser diagnostics.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct KernelError {
    pub code: &'static str,
    pub message: &'static str,
}

const INVALID_REQUEST: KernelError = KernelError {
    code: "INVALID_REQUEST",
    message: "Provide one exact state-kernel request with supported command fields.",
};
pub const INPUT_TOO_LARGE: KernelError = KernelError {
    code: "INPUT_TOO_LARGE",
    message: "The request exceeds the two MiB input limit.",
};
pub const INPUT_READ_FAILED: KernelError = KernelError {
    code: "INPUT_READ_FAILED",
    message: "The request could not be read from standard input.",
};
const LIMIT_EXCEEDED: KernelError = KernelError {
    code: "LIMIT_EXCEEDED",
    message: "The request exceeds a command or live-object limit.",
};
const INVALID_ID: KernelError = KernelError {
    code: "INVALID_ID",
    message: "Identifiers must contain 1 to 80 permitted ASCII characters.",
};
const INVALID_TEXT: KernelError = KernelError {
    code: "INVALID_TEXT",
    message: "Titles, bodies, or relation labels violate their text limits.",
};
const DUPLICATE_COMMAND_ID: KernelError = KernelError {
    code: "DUPLICATE_COMMAND_ID",
    message: "A command identifier appears more than once in this history.",
};
const ID_ALREADY_USED: KernelError = KernelError {
    code: "ID_ALREADY_USED",
    message: "An object identifier has already been used in this history.",
};
const NOTATION_NOT_FOUND: KernelError = KernelError {
    code: "NOTATION_NOT_FOUND",
    message: "A command requires a notation that is not present.",
};
const INVALID_RELATION: KernelError = KernelError {
    code: "INVALID_RELATION",
    message: "A relation must connect two distinct present notations.",
};
const NOTHING_TO_UNDO: KernelError = KernelError {
    code: "NOTHING_TO_UNDO",
    message: "There is no content change to undo.",
};
const NOTHING_TO_REDO: KernelError = KernelError {
    code: "NOTHING_TO_REDO",
    message: "There is no content change to redo.",
};
const NO_CHANGE: KernelError = KernelError {
    code: "NO_CHANGE",
    message: "An update must change the notation title or body.",
};
const INTERNAL_STATE_ERROR: KernelError = KernelError {
    code: "INTERNAL_STATE_ERROR",
    message: "The replay could not preserve its state invariants.",
};

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Response {
    Success { ok: bool, state: NotationState },
    Failure { ok: bool, error: KernelError },
}

impl Response {
    pub fn failure(error: KernelError) -> Self {
        Self::Failure { ok: false, error }
    }

    pub fn is_ok(&self) -> bool {
        matches!(self, Self::Success { .. })
    }
}

fn validate_id(id: &str) -> Result<(), KernelError> {
    let bytes = id.as_bytes();
    if bytes.is_empty()
        || bytes.len() > 80
        || !bytes[0].is_ascii_alphanumeric()
        || !bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'-'))
    {
        return Err(INVALID_ID);
    }
    Ok(())
}

fn validate_text(text: &str, maximum: usize, blank_allowed: bool) -> Result<(), KernelError> {
    // Limits count Unicode scalar values, not UTF-8 bytes. No silent trimming.
    if text.chars().count() > maximum || (!blank_allowed && text.trim().is_empty()) {
        return Err(INVALID_TEXT);
    }
    Ok(())
}

/// Inverse records bound memory by accepted command content rather than copying
/// every entire state. Reserved identities survive undo and discarded redo branches.
#[derive(Clone, Debug)]
enum Change {
    CreatedNotation(Notation),
    UpdatedNotation { before: Notation, after: Notation },
    CreatedRelation(Relation),
}

#[derive(Default)]
struct Replay {
    notations: BTreeMap<String, Notation>,
    relations: BTreeMap<String, Relation>,
    used_objects: BTreeSet<String>,
    used_commands: BTreeSet<String>,
    undo: Vec<Change>,
    redo: Vec<Change>,
    revision: usize,
}

impl Replay {
    fn reserve(&mut self, id: &str) -> Result<(), KernelError> {
        if !self.used_objects.insert(id.to_owned()) {
            return Err(ID_ALREADY_USED);
        }
        Ok(())
    }

    fn forward(&mut self, change: &Change) {
        match change {
            Change::CreatedNotation(notation)
            | Change::UpdatedNotation {
                after: notation, ..
            } => {
                self.notations.insert(notation.id.clone(), notation.clone());
            }
            Change::CreatedRelation(relation) => {
                self.relations.insert(relation.id.clone(), relation.clone());
            }
        }
    }

    fn backward(&mut self, change: &Change) {
        match change {
            Change::CreatedNotation(notation) => {
                // Later relation creation is necessarily undone first in linear history.
                self.notations.remove(&notation.id);
            }
            Change::UpdatedNotation { before, .. } => {
                self.notations.insert(before.id.clone(), before.clone());
            }
            Change::CreatedRelation(relation) => {
                self.relations.remove(&relation.id);
            }
        }
    }

    fn validate(&self) -> Result<(), KernelError> {
        if self.notations.len() > MAX_NOTATIONS
            || self.relations.len() > MAX_RELATIONS
            || self.relations.values().any(|relation| {
                relation.from == relation.to
                    || !self.notations.contains_key(&relation.from)
                    || !self.notations.contains_key(&relation.to)
                    || self.notations.contains_key(&relation.id)
            })
        {
            return Err(INTERNAL_STATE_ERROR);
        }
        Ok(())
    }

    fn accept(&mut self, command: Command) -> Result<(), KernelError> {
        validate_id(command.id())?;
        if !self.used_commands.insert(command.id().to_owned()) {
            return Err(DUPLICATE_COMMAND_ID);
        }
        let change = match command {
            Command::CreateNotation { notation, .. } => {
                validate_id(&notation.id)?;
                validate_text(&notation.title, 160, false)?;
                validate_text(&notation.body, 8000, true)?;
                if self.notations.len() >= MAX_NOTATIONS {
                    return Err(LIMIT_EXCEEDED);
                }
                self.reserve(&notation.id)?;
                Some(Change::CreatedNotation(notation))
            }
            Command::UpdateNotation {
                notation_id,
                title,
                body,
                ..
            } => {
                validate_id(&notation_id)?;
                validate_text(&title, 160, false)?;
                validate_text(&body, 8000, true)?;
                let before = self
                    .notations
                    .get(&notation_id)
                    .ok_or(NOTATION_NOT_FOUND)?
                    .clone();
                if before.title == title && before.body == body {
                    return Err(NO_CHANGE);
                }
                let after = Notation {
                    id: notation_id,
                    title,
                    body,
                };
                Some(Change::UpdatedNotation { before, after })
            }
            Command::CreateRelation { relation, .. } => {
                validate_id(&relation.id)?;
                validate_id(&relation.from)?;
                validate_id(&relation.to)?;
                validate_text(&relation.label, 80, false)?;
                if relation.from == relation.to
                    || !self.notations.contains_key(&relation.from)
                    || !self.notations.contains_key(&relation.to)
                {
                    return Err(INVALID_RELATION);
                }
                if self.relations.len() >= MAX_RELATIONS {
                    return Err(LIMIT_EXCEEDED);
                }
                self.reserve(&relation.id)?;
                Some(Change::CreatedRelation(relation))
            }
            Command::Undo { .. } => {
                let change = self.undo.pop().ok_or(NOTHING_TO_UNDO)?;
                self.backward(&change);
                self.redo.push(change);
                None
            }
            Command::Redo { .. } => {
                let change = self.redo.pop().ok_or(NOTHING_TO_REDO)?;
                self.forward(&change);
                self.undo.push(change);
                None
            }
        };
        if let Some(change) = change {
            self.forward(&change);
            self.undo.push(change);
            self.redo.clear();
        }
        self.validate()?;
        self.revision += 1;
        Ok(())
    }

    fn state(self) -> NotationState {
        NotationState {
            schema: STATE_SCHEMA,
            revision: self.revision,
            notations: self.notations.into_values().collect(),
            relations: self.relations.into_values().collect(),
            can_undo: !self.undo.is_empty(),
            can_redo: !self.redo.is_empty(),
        }
    }
}

pub fn replay(request: Request) -> Result<NotationState, KernelError> {
    if request.schema != REQUEST_SCHEMA {
        return Err(INVALID_REQUEST);
    }
    if request.commands.len() > MAX_COMMANDS {
        return Err(LIMIT_EXCEEDED);
    }
    let mut replay = Replay::default();
    for command in request.commands {
        replay.accept(command)?;
    }
    Ok(replay.state())
}

pub fn process_request(input: &[u8]) -> Result<NotationState, KernelError> {
    if input.len() > MAX_INPUT_BYTES {
        return Err(INPUT_TOO_LARGE);
    }
    let request: Request = serde_json::from_slice(input).map_err(|_| INVALID_REQUEST)?;
    replay(request)
}

pub fn execute_json(input: &[u8]) -> Response {
    match process_request(input) {
        Ok(state) => Response::Success { ok: true, state },
        Err(error) => Response::failure(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn create(command: &str, id: &str) -> Value {
        json!({"commandId":command,"kind":"CREATE_NOTATION","notation":{"id":id,"title":"Notation","body":""}})
    }
    fn update(command: &str, id: &str, title: &str, body: &str) -> Value {
        json!({"commandId":command,"kind":"UPDATE_NOTATION","notationId":id,"title":title,"body":body})
    }
    fn relation(command: &str, id: &str, from: &str, to: &str) -> Value {
        json!({"commandId":command,"kind":"CREATE_RELATION","relation":{"id":id,"from":from,"to":to,"label":"relates to"}})
    }
    fn undo(command: &str) -> Value {
        json!({"commandId":command,"kind":"UNDO"})
    }
    fn redo(command: &str) -> Value {
        json!({"commandId":command,"kind":"REDO"})
    }
    fn run(commands: Vec<Value>) -> Result<NotationState, KernelError> {
        process_request(
            &serde_json::to_vec(&json!({"schema":REQUEST_SCHEMA,"commands":commands})).unwrap(),
        )
    }
    fn fails(commands: Vec<Value>, code: &str) {
        assert_eq!(run(commands).unwrap_err().code, code);
    }

    #[test]
    fn empty_state_has_no_undo_redo_or_implicit_objects() {
        assert_eq!(
            run(vec![]).unwrap(),
            NotationState {
                schema: STATE_SCHEMA,
                revision: 0,
                notations: vec![],
                relations: vec![],
                can_undo: false,
                can_redo: false
            }
        );
    }

    #[test]
    fn create_update_undo_redo_preserve_ids_and_both_text_values() {
        let history = vec![create("c1", "n1"), update("c2", "n1", "Changed", "Body")];
        let changed = run(history.clone()).unwrap();
        assert_eq!(
            changed.notations[0],
            Notation {
                id: "n1".into(),
                title: "Changed".into(),
                body: "Body".into()
            }
        );
        let mut undone = history.clone();
        undone.push(undo("c3"));
        let state = run(undone.clone()).unwrap();
        assert_eq!(state.notations[0].title, "Notation");
        assert_eq!(state.notations[0].body, "");
        assert!(state.can_undo && state.can_redo);
        undone.push(redo("c4"));
        let restored = run(undone).unwrap();
        assert_eq!(restored.notations, changed.notations);
        assert_eq!(restored.revision, 4);
        assert!(!restored.can_redo);
    }

    #[test]
    fn undo_all_then_redo_all_restores_relations_in_dependency_order() {
        let original = vec![
            create("c1", "z"),
            create("c2", "a"),
            relation("c3", "r", "z", "a"),
        ];
        let expected = run(original.clone()).unwrap();
        let mut history = original;
        history.extend([undo("c4"), undo("c5"), undo("c6")]);
        let empty = run(history.clone()).unwrap();
        assert!(empty.notations.is_empty() && empty.relations.is_empty());
        assert!(!empty.can_undo && empty.can_redo);
        history.extend([redo("c7"), redo("c8"), redo("c9")]);
        let state = run(history).unwrap();
        assert_eq!(state.notations, expected.notations);
        assert_eq!(state.relations, expected.relations);
        assert_eq!(state.revision, 9);
    }

    #[test]
    fn new_content_after_undo_discards_redo_not_reserved_identity() {
        let history = vec![create("c1", "old"), undo("c2"), create("c3", "new")];
        let state = run(history.clone()).unwrap();
        assert!(!state.can_redo);
        assert_eq!(state.notations[0].id, "new");
        let mut reuse = history.clone();
        reuse.push(create("c4", "old"));
        fails(reuse, "ID_ALREADY_USED");
        let mut retry = history;
        retry.push(redo("c4"));
        fails(retry, "NOTHING_TO_REDO");
    }

    #[test]
    fn update_also_clears_redo_branch() {
        fails(
            vec![
                create("c1", "n"),
                update("c2", "n", "First", ""),
                undo("c3"),
                update("c4", "n", "Alternate", ""),
                redo("c5"),
            ],
            "NOTHING_TO_REDO",
        );
    }

    #[test]
    fn relation_creation_also_clears_redo_branch() {
        fails(
            vec![
                create("c1", "a"),
                create("c2", "b"),
                update("c3", "a", "First", ""),
                undo("c4"),
                relation("c5", "r", "a", "b"),
                redo("c6"),
            ],
            "NOTHING_TO_REDO",
        );
    }

    #[test]
    fn relation_id_cannot_be_reused_after_undo_even_for_a_notation() {
        let base = vec![
            create("c1", "a"),
            create("c2", "b"),
            relation("c3", "r", "a", "b"),
            undo("c4"),
        ];
        let mut again = base.clone();
        again.push(relation("c5", "r", "a", "b"));
        fails(again, "ID_ALREADY_USED");
        let mut cross_kind = base;
        cross_kind.push(create("c5", "r"));
        fails(cross_kind, "ID_ALREADY_USED");
    }

    #[test]
    fn object_namespace_is_shared_across_live_notations_and_relations() {
        fails(
            vec![
                create("c1", "a"),
                create("c2", "b"),
                relation("c3", "a", "a", "b"),
            ],
            "ID_ALREADY_USED",
        );
        fails(
            vec![create("c1", "a"), create("c2", "a")],
            "ID_ALREADY_USED",
        );
    }

    #[test]
    fn command_namespace_is_separate_but_all_history_ids_are_unique() {
        assert!(run(vec![create("same", "same")]).is_ok());
        fails(
            vec![create("c1", "a"), undo("c2"), redo("c2")],
            "DUPLICATE_COMMAND_ID",
        );
        fails(
            vec![create("c1", "a"), undo("c2"), create("c1", "b")],
            "DUPLICATE_COMMAND_ID",
        );
    }

    #[test]
    fn endpoint_existence_and_no_self_relation_are_enforced() {
        fails(
            vec![create("c1", "a"), relation("c2", "r", "a", "missing")],
            "INVALID_RELATION",
        );
        fails(
            vec![create("c1", "a"), relation("c2", "r", "a", "a")],
            "INVALID_RELATION",
        );
        fails(
            vec![
                create("c1", "a"),
                create("c2", "b"),
                undo("c3"),
                relation("c4", "r", "a", "b"),
            ],
            "INVALID_RELATION",
        );
    }

    #[test]
    fn empty_undo_redo_missing_update_and_noop_are_rejected() {
        fails(vec![undo("c1")], "NOTHING_TO_UNDO");
        fails(vec![redo("c1")], "NOTHING_TO_REDO");
        fails(vec![update("c1", "missing", "A", "")], "NOTATION_NOT_FOUND");
        fails(
            vec![create("c1", "a"), update("c2", "a", "Notation", "")],
            "NO_CHANGE",
        );
        fails(
            vec![create("c1", "a"), undo("c2"), undo("c3")],
            "NOTHING_TO_UNDO",
        );
    }

    #[test]
    fn output_is_stably_ordered_not_creation_order() {
        let state = run(vec![
            create("c1", "z"),
            create("c2", "B"),
            create("c3", "a"),
            relation("c4", "r-z", "z", "B"),
            relation("c5", "r-A", "a", "B"),
        ])
        .unwrap();
        assert_eq!(
            state
                .notations
                .iter()
                .map(|n| n.id.as_str())
                .collect::<Vec<_>>(),
            ["B", "a", "z"]
        );
        assert_eq!(
            state
                .relations
                .iter()
                .map(|r| r.id.as_str())
                .collect::<Vec<_>>(),
            ["r-A", "r-z"]
        );
    }

    #[test]
    fn saved_history_roundtrip_replays_byte_equivalent_state_and_history_flags() {
        let json = json!({"schema":REQUEST_SCHEMA,"commands":[create("c1", "a"), update("c2", "a", "Changed", "Body"), undo("c3")]});
        let compact = serde_json::to_vec(&json).unwrap();
        let decoded: Request = serde_json::from_slice(&compact).unwrap();
        let saved = serde_json::to_vec_pretty(&decoded).unwrap();
        assert_eq!(execute_json(&compact), execute_json(&saved));
        assert_eq!(
            serde_json::to_vec(&execute_json(&compact)).unwrap(),
            serde_json::to_vec(&execute_json(&saved)).unwrap()
        );
    }

    #[test]
    fn identifiers_follow_the_exact_ascii_grammar() {
        for id in [
            "",
            "_bad",
            ":bad",
            ".bad",
            "-bad",
            "has space",
            "a/b",
            "a\\b",
            "é",
            "a\n",
            "a\0",
        ] {
            fails(vec![create("c1", id)], "INVALID_ID");
        }
        fails(vec![create("c1", &"a".repeat(81))], "INVALID_ID");
        assert!(run(vec![create("command:1_A.-", &"a".repeat(80))]).is_ok());
        fails(vec![create("bad id", "a")], "INVALID_ID");
        fails(vec![update("c1", "bad id", "Title", "")], "INVALID_ID");
        fails(
            vec![create("c1", "a"), relation("c2", "r", "a", "bad/id")],
            "INVALID_ID",
        );
    }

    #[test]
    fn text_limits_are_unicode_scalar_counts_and_do_not_trim_values() {
        let mut command = create("c1", "a");
        command["notation"]["title"] = json!("🦀".repeat(160));
        command["notation"]["body"] = json!("界".repeat(8000));
        let state = run(vec![command.clone()]).unwrap();
        assert_eq!(state.notations[0].title.chars().count(), 160);
        command["notation"]["title"] = json!("🦀".repeat(161));
        fails(vec![command], "INVALID_TEXT");
        let state = run(vec![
            create("c1", "a"),
            update("c2", "a", "  exact title  ", "  body\n"),
        ])
        .unwrap();
        assert_eq!(state.notations[0].title, "  exact title  ");
        assert_eq!(state.notations[0].body, "  body\n");
        fails(
            vec![
                create("c1", "a"),
                update("c2", "a", "Title", &"x".repeat(8001)),
            ],
            "INVALID_TEXT",
        );
        for blank in ["", "  \n\t", "\u{2003}"] {
            fails(
                vec![create("c1", "a"), update("c2", "a", blank, "body")],
                "INVALID_TEXT",
            );
        }
    }

    #[test]
    fn relation_labels_are_nonblank_and_bounded() {
        for label in ["".to_owned(), " \t".to_owned(), "x".repeat(81)] {
            let mut command = relation("c3", "r", "a", "b");
            command["relation"]["label"] = json!(label);
            fails(
                vec![create("c1", "a"), create("c2", "b"), command],
                "INVALID_TEXT",
            );
        }
        let mut command = relation("c3", "r", "a", "b");
        command["relation"]["label"] = json!("界".repeat(80));
        assert!(run(vec![create("c1", "a"), create("c2", "b"), command]).is_ok());
    }

    #[test]
    fn live_notation_limit_allows_new_identity_after_undo() {
        let mut commands: Vec<_> = (0..64)
            .map(|i| create(&format!("c{i}"), &format!("n{i}")))
            .collect();
        assert_eq!(
            run(commands.clone()).unwrap().notations.len(),
            MAX_NOTATIONS
        );
        let mut excessive = commands.clone();
        excessive.push(create("extra", "extra"));
        fails(excessive, "LIMIT_EXCEEDED");
        commands.extend([undo("undo"), create("branch", "new-id")]);
        assert_eq!(run(commands).unwrap().notations.len(), MAX_NOTATIONS);
    }

    #[test]
    fn live_relation_limit_is_128() {
        let mut commands = vec![create("a", "a"), create("b", "b")];
        commands.extend((0..128).map(|i| relation(&format!("c{i}"), &format!("r{i}"), "a", "b")));
        assert_eq!(
            run(commands.clone()).unwrap().relations.len(),
            MAX_RELATIONS
        );
        commands.push(relation("extra", "extra", "a", "b"));
        fails(commands, "LIMIT_EXCEEDED");
    }

    #[test]
    fn command_limit_includes_undo_and_redo() {
        let mut commands = vec![create("c0", "a")];
        commands.extend((1..256).map(|i| {
            if i % 2 == 1 {
                undo(&format!("c{i}"))
            } else {
                redo(&format!("c{i}"))
            }
        }));
        assert_eq!(run(commands.clone()).unwrap().revision, MAX_COMMANDS);
        commands.push(redo("c256"));
        fails(commands, "LIMIT_EXCEEDED");
    }

    #[test]
    fn schema_unknown_fields_unknown_commands_and_types_are_closed() {
        let valid = json!({"schema":REQUEST_SCHEMA,"commands":[create("c1", "a")]});
        for bad in [
            json!(null),
            json!([]),
            json!({"schema":"wrong","commands":[]}),
            json!({"schema":REQUEST_SCHEMA}),
            json!({"schema":REQUEST_SCHEMA,"commands":[],"path":"private"}),
            json!({"schema":REQUEST_SCHEMA,"commands":[{"commandId":"c1","kind":"DELETE_NOTATION"}]}),
            json!({"schema":REQUEST_SCHEMA,"commands":[{"commandId":"c1","kind":"UNDO","path":"private"}]}),
        ] {
            assert_eq!(
                process_request(&serde_json::to_vec(&bad).unwrap())
                    .unwrap_err()
                    .code,
                "INVALID_REQUEST"
            );
        }
        for pointer in ["/commands/0/extra", "/commands/0/notation/extra"] {
            let mut bad = valid.clone();
            let parent = pointer.rsplit_once('/').unwrap().0;
            bad.pointer_mut(parent)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .insert("extra".into(), json!(true));
            assert_eq!(
                process_request(&serde_json::to_vec(&bad).unwrap())
                    .unwrap_err()
                    .code,
                "INVALID_REQUEST"
            );
        }
        let mut bad = valid;
        bad["commands"][0]["notation"]["title"] = json!(12);
        assert_eq!(
            process_request(&serde_json::to_vec(&bad).unwrap())
                .unwrap_err()
                .code,
            "INVALID_REQUEST"
        );
    }

    #[test]
    fn malformed_duplicate_keys_trailing_json_and_non_utf8_are_rejected() {
        for bytes in [b"not JSON".as_slice(), b"\xff", b"{} {}",
            br#"{"schema":"notations.state-kernel-request.v1","schema":"notations.state-kernel-request.v1","commands":[]}"#,
            br#"{"schema":"notations.state-kernel-request.v1","commands":[{"commandId":"c1","kind":"UNDO","kind":"REDO"}]}"#,
            br#"{"schema":"notations.state-kernel-request.v1","commands":[{"commandId":"c1","kind":"CREATE_NOTATION","notation":{"id":"a","id":"b","title":"T","body":""}}]}"#] {
            assert_eq!(process_request(bytes).unwrap_err().code, "INVALID_REQUEST");
        }
    }

    #[test]
    fn input_bytes_are_bounded_independently_of_valid_json() {
        let mut input =
            serde_json::to_vec(&json!({"schema":REQUEST_SCHEMA,"commands":[]})).unwrap();
        input.resize(MAX_INPUT_BYTES, b' ');
        assert!(process_request(&input).is_ok());
        input.push(b' ');
        assert_eq!(process_request(&input).unwrap_err(), INPUT_TOO_LARGE);
    }

    #[test]
    fn failures_are_fixed_and_never_include_partial_state_or_private_input() {
        let input = json!({"schema":REQUEST_SCHEMA,"commands":[create("c1", "a"),
            {"commandId":"private source path","kind":"UNDO"}]});
        let response = execute_json(&serde_json::to_vec(&input).unwrap());
        assert!(!response.is_ok());
        let output = serde_json::to_value(response).unwrap();
        assert_eq!(output["ok"], false);
        assert!(output.get("state").is_none());
        assert!(!output.to_string().contains("private source path"));
        assert_eq!(output["error"]["code"], "INVALID_ID");
    }
}
