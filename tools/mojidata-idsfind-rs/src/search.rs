use std::cmp::Ordering;
use std::collections::HashMap;
use std::error::Error;
use std::io;
use std::path::Path;
use std::str::FromStr;

use rusqlite::{Connection, OpenFlags, OptionalExtension, params_from_iter};

use crate::query::Query;

type Decompositions = HashMap<String, Vec<Vec<String>>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CandidateSource {
    Fts5,
    All,
}

impl FromStr for CandidateSource {
    type Err = Box<dyn Error>;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "fts5" => Ok(Self::Fts5),
            "all" => Ok(Self::All),
            _ => Err(Box::new(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("unsupported candidate source: {value}"),
            ))),
        }
    }
}

pub struct SearchOutcome {
    pub results: Vec<String>,
    #[allow(dead_code)]
    pub candidate_count: usize,
}

pub fn search_database(
    path: &Path,
    query: &Query,
    candidate_source: CandidateSource,
) -> Result<SearchOutcome, Box<dyn Error>> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    search_connection(&connection, query, candidate_source)
}

fn validate_semantics(connection: &Connection) -> Result<(), Box<dyn Error>> {
    let row = connection
        .query_row(
            "SELECT schema_version, semantics_mode, semantics_profile, query_plan_json \
             FROM idsfind_semantics ORDER BY schema_version DESC LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "idsfind_semantics is empty"))?;
    if row.0 != 3
        || row.1 != "registered"
        || row.2.as_deref() != Some("idsflow-records@1")
        || row.3.is_some()
    {
        return Err(Box::new(io::Error::new(
            io::ErrorKind::InvalidData,
            "native search requires schema 3 registered idsflow-records@1 semantics",
        )));
    }
    Ok(())
}

fn load_candidates(
    connection: &Connection,
    query: &Query,
    source: CandidateSource,
) -> Result<Vec<String>, Box<dyn Error>> {
    let (sql, parameter) = match source {
        CandidateSource::Fts5 => {
            let pattern = query.fts5_pattern();
            if pattern.is_empty() {
                return load_all_candidates(connection);
            }
            (
                "SELECT DISTINCT idsfind.UCS \
                 FROM idsfind_fts \
                 JOIN idsfind ON idsfind.rowid = idsfind_fts.rowid \
                 WHERE idsfind_fts MATCH ?1",
                Some(pattern),
            )
        }
        CandidateSource::All => return load_all_candidates(connection),
    };
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map([parameter.as_deref().unwrap()], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<String>, _>>()?)
}

fn load_all_candidates(connection: &Connection) -> Result<Vec<String>, Box<dyn Error>> {
    let mut statement = connection.prepare("SELECT DISTINCT UCS FROM idsfind")?;
    let rows = statement.query_map([], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<String>, _>>()?)
}

fn load_decompositions(
    connection: &Connection,
    candidates: &[String],
) -> Result<Decompositions, Box<dyn Error>> {
    let mut decompositions = HashMap::new();
    for chunk in candidates.chunks(256) {
        let placeholders = std::iter::repeat_n("?", chunk.len())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!("SELECT UCS, IDS_tokens FROM idsfind WHERE UCS IN ({placeholders})");
        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(chunk.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (ucs, ids_tokens) = row?;
            decompositions
                .entry(ucs)
                .or_insert_with(Vec::new)
                .push(ids_tokens.split_whitespace().map(str::to_owned).collect());
        }
    }
    Ok(decompositions)
}

fn utf16_cmp(left: &str, right: &str) -> Ordering {
    let mut left = left.encode_utf16();
    let mut right = right.encode_utf16();
    loop {
        match (left.next(), right.next()) {
            (Some(left), Some(right)) => match left.cmp(&right) {
                Ordering::Equal => {}
                other => return other,
            },
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (None, None) => return Ordering::Equal,
        }
    }
}

pub fn search_connection(
    connection: &Connection,
    query: &Query,
    candidate_source: CandidateSource,
) -> Result<SearchOutcome, Box<dyn Error>> {
    validate_semantics(connection)?;
    let candidates = load_candidates(connection, query, candidate_source)?;
    let candidate_count = candidates.len();
    let decompositions = load_decompositions(connection, &candidates)?;
    let mut results = candidates
        .into_iter()
        .filter(|ucs| {
            decompositions
                .get(ucs)
                .is_some_and(|trees| trees.iter().any(|tree| query.matches(tree)))
        })
        .collect::<Vec<_>>();
    results.sort_by(|left, right| utf16_cmp(left, right));
    results.dedup();
    Ok(SearchOutcome {
        results,
        candidate_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                r#"
                CREATE TABLE idsfind (UCS TEXT NOT NULL, IDS_tokens TEXT NOT NULL);
                CREATE INDEX idsfind_UCS ON idsfind (UCS);
                CREATE TABLE idsfind_semantics (
                  schema_version INTEGER PRIMARY KEY,
                  semantics_mode TEXT NOT NULL,
                  semantics_profile TEXT,
                  query_plan_json TEXT
                );
                INSERT INTO idsfind_semantics VALUES
                  (3, 'registered', 'idsflow-records@1', NULL);
                INSERT INTO idsfind VALUES
                  ('A', '⿱ 木 ⿰ 火 土'),
                  ('A', '⿰ 金 土'),
                  ('B', '⿰ 土 火');
                CREATE VIRTUAL TABLE idsfind_fts USING fts5(
                  content='',
                  tokenize = "unicode61 tokenchars '§⿰⿱'",
                  IDS_tokens
                );
                INSERT INTO idsfind_fts(rowid, IDS_tokens) VALUES
                  (1, '§ ⿱ 木 ⿰ 火 土 § § ⿰ 金 土 §'),
                  (3, '§ ⿰ 土 火 §');
                "#,
            )
            .unwrap();
        connection
    }

    #[test]
    fn exact_scan_and_fts5_return_the_same_verified_results() {
        let connection = fixture();
        for text in ["⿰火土", "⿰？土", "§⿰金土§", "§⿰土火§", "⿱火土"] {
            let query = Query::parse(text).unwrap();
            let exact = search_connection(&connection, &query, CandidateSource::All).unwrap();
            let fts5 = search_connection(&connection, &query, CandidateSource::Fts5).unwrap();
            assert_eq!(fts5.results, exact.results, "query {text}");
            assert!(fts5.candidate_count <= exact.candidate_count);
        }
    }

    #[test]
    fn strict_semantics_rejects_non_record_profile() {
        let connection = fixture();
        connection
            .execute(
                "UPDATE idsfind_semantics SET semantics_profile = 'idsflow-decompose@1'",
                [],
            )
            .unwrap();
        let error = search_connection(
            &connection,
            &Query::parse("木").unwrap(),
            CandidateSource::All,
        )
        .err()
        .unwrap();
        assert!(error.to_string().contains("idsflow-records@1"));
    }
}
