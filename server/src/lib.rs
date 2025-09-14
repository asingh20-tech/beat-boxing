use spacetimedb::{reducer, table, Identity, ReducerContext, Table, Timestamp};

// Keep a simple user presence table (reused from the chat demo)
#[table(name = user, public)]
pub struct User {
    #[primary_key]
    identity: Identity,
    name: Option<String>,
    online: bool,
}

// New Lobby table to support 2-player lobbies with independent counters
#[table(name = lobby, public)]
pub struct Lobby {
    #[primary_key]
    code: String,
    red: Option<Identity>,
    blue: Option<Identity>,
    red_count: u32,
    blue_count: u32,
    created: Timestamp,
    // Multiplayer selections/state
    red_char: Option<String>,
    blue_char: Option<String>,
    red_ready: bool,
    blue_ready: bool,
    song_id: Option<String>,
}

fn validate_code(code: &str) -> Result<(), String> {
    let ok_len = (4..=12).contains(&code.len());
    let ok_chars = code.chars().all(|c| c.is_ascii_alphanumeric());
    if ok_len && ok_chars { Ok(()) } else { Err("Invalid lobby code".into()) }
}

#[reducer]
pub fn create_lobby(ctx: &ReducerContext, code: String) -> Result<(), String> {
    let code_up = code.to_uppercase();
    validate_code(&code_up)?;
    if ctx.db.lobby().code().find(&code_up).is_some() {
        return Err("Lobby code already exists".into());
    }
    ctx.db.lobby().insert(Lobby {
        code: code_up,
        red: Some(ctx.sender),
        blue: None,
        red_count: 0,
        blue_count: 0,
        created: ctx.timestamp,
    red_char: None,
    blue_char: None,
    red_ready: false,
    blue_ready: false,
    song_id: None,
    });
    Ok(())
}

#[reducer]
pub fn join_lobby(ctx: &ReducerContext, code: String) -> Result<(), String> {
    let code_up = code.to_uppercase();
    validate_code(&code_up)?;
    if let Some(lobby) = ctx.db.lobby().code().find(&code_up) {
        // Already in lobby? no-op
        if lobby.red == Some(ctx.sender) || lobby.blue == Some(ctx.sender) {
            return Ok(());
        }
        if lobby.red.is_none() {
            ctx.db.lobby().code().update(Lobby { red: Some(ctx.sender), ..lobby });
            Ok(())
        } else if lobby.blue.is_none() {
            ctx.db.lobby().code().update(Lobby { blue: Some(ctx.sender), ..lobby });
            Ok(())
        } else {
            Err("Lobby is full".into())
        }
    } else {
        Err("Lobby not found".into())
    }
}

#[reducer]
pub fn increment(ctx: &ReducerContext, code: String) -> Result<(), String> {
    let code_up = code.to_uppercase();
    if let Some(lobby) = ctx.db.lobby().code().find(&code_up) {
        if lobby.red == Some(ctx.sender) {
            ctx.db
                .lobby()
                .code()
                .update(Lobby { red_count: lobby.red_count.saturating_add(1), ..lobby });
            Ok(())
        } else if lobby.blue == Some(ctx.sender) {
            ctx.db
                .lobby()
                .code()
                .update(Lobby { blue_count: lobby.blue_count.saturating_add(1), ..lobby });
            Ok(())
        } else {
            Err("You are not a member of this lobby".into())
        }
    } else {
        Err("Lobby not found".into())
    }
}

#[reducer]
pub fn increment_by(ctx: &ReducerContext, code: String, delta: u32) -> Result<(), String> {
    let code_up = code.to_uppercase();
    if let Some(lobby) = ctx.db.lobby().code().find(&code_up) {
        if lobby.red == Some(ctx.sender) {
            ctx.db
                .lobby()
                .code()
                .update(Lobby { red_count: lobby.red_count.saturating_add(delta), ..lobby });
            Ok(())
        } else if lobby.blue == Some(ctx.sender) {
            ctx.db
                .lobby()
                .code()
                .update(Lobby { blue_count: lobby.blue_count.saturating_add(delta), ..lobby });
            Ok(())
        } else {
            Err("You are not a member of this lobby".into())
        }
    } else {
        Err("Lobby not found".into())
    }
}

#[reducer]
pub fn set_character(ctx: &ReducerContext, code: String, character: String) -> Result<(), String> {
    let code_up = code.to_uppercase();
    if character.trim().is_empty() { return Err("Character must not be empty".into()); }
    if let Some(lobby) = ctx.db.lobby().code().find(&code_up) {
        if lobby.red == Some(ctx.sender) {
            ctx.db.lobby().code().update(Lobby { red_char: Some(character), ..lobby });
            Ok(())
        } else if lobby.blue == Some(ctx.sender) {
            ctx.db.lobby().code().update(Lobby { blue_char: Some(character), ..lobby });
            Ok(())
        } else {
            Err("You are not a member of this lobby".into())
        }
    } else { Err("Lobby not found".into()) }
}

#[reducer]
pub fn set_ready(ctx: &ReducerContext, code: String, ready: bool) -> Result<(), String> {
    let code_up = code.to_uppercase();
    if let Some(lobby) = ctx.db.lobby().code().find(&code_up) {
        if lobby.red == Some(ctx.sender) {
            ctx.db.lobby().code().update(Lobby { red_ready: ready, ..lobby });
            Ok(())
        } else if lobby.blue == Some(ctx.sender) {
            ctx.db.lobby().code().update(Lobby { blue_ready: ready, ..lobby });
            Ok(())
        } else {
            Err("You are not a member of this lobby".into())
        }
    } else { Err("Lobby not found".into()) }
}

#[reducer]
pub fn set_song(ctx: &ReducerContext, code: String, song_id: String) -> Result<(), String> {
    let code_up = code.to_uppercase();
    if song_id.trim().is_empty() { return Err("Song id must not be empty".into()); }
    if let Some(lobby) = ctx.db.lobby().code().find(&code_up) {
        ctx.db.lobby().code().update(Lobby { song_id: Some(song_id), ..lobby });
        Ok(())
    } else { Err("Lobby not found".into()) }
}

/// Mark users online when they connect
#[reducer(client_connected)]
pub fn client_connected(ctx: &ReducerContext) {
    if let Some(user) = ctx.db.user().identity().find(ctx.sender) {
        ctx.db.user().identity().update(User { online: true, ..user });
    } else {
        ctx.db.user().insert(User { name: None, identity: ctx.sender, online: true });
    }
}

/// Mark users offline when they disconnect
#[reducer(client_disconnected)]
pub fn client_disconnected(ctx: &ReducerContext) {
    if let Some(user) = ctx.db.user().identity().find(ctx.sender) {
        ctx.db.user().identity().update(User { online: false, ..user });
    }
}
