mod query;
mod search;

use std::env;
use std::error::Error;
use std::io::{self, Write};
use std::path::PathBuf;
use std::str::FromStr;

use query::Query;
use search::{CandidateSource, candidate_database, search_database};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OutputKind {
    Results,
    Candidates,
}

impl FromStr for OutputKind {
    type Err = Box<dyn Error>;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "results" => Ok(Self::Results),
            "candidates" => Ok(Self::Candidates),
            _ => Err(invalid_input(format!("unsupported output kind: {value}"))),
        }
    }
}

struct Options {
    db_path: PathBuf,
    query: Query,
    candidate_source: CandidateSource,
    output_kind: OutputKind,
}

fn invalid_input(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(io::Error::new(io::ErrorKind::InvalidInput, message.into()))
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Options, Box<dyn Error>> {
    let mut args = args.into_iter();
    let mut db_path = None;
    let mut query_json = None;
    let mut candidate_source = CandidateSource::Fts5;
    let mut output_kind = OutputKind::Results;
    while let Some(name) = args.next() {
        let value = args
            .next()
            .ok_or_else(|| invalid_input(format!("{name} requires a value")))?;
        match name.as_str() {
            "--db" => db_path = Some(PathBuf::from(value)),
            "--query-json" => query_json = Some(value),
            "--candidate-source" => candidate_source = value.parse()?,
            "--output-kind" => output_kind = value.parse()?,
            _ => return Err(invalid_input(format!("unsupported argument: {name}"))),
        }
    }
    let db_path = db_path.ok_or_else(|| invalid_input("--db is required"))?;
    let query_json = query_json.ok_or_else(|| invalid_input("--query-json is required"))?;
    let query_strings: Vec<String> = serde_json::from_str(&query_json)
        .map_err(|error| invalid_input(format!("--query-json must be a string array: {error}")))?;
    let query = Query::parse_group(&query_strings)?;
    Ok(Options {
        db_path,
        query,
        candidate_source,
        output_kind,
    })
}

fn run() -> Result<(), Box<dyn Error>> {
    let options = parse_args(env::args().skip(1))?;
    let output = match options.output_kind {
        OutputKind::Results => {
            search_database(&options.db_path, &options.query, options.candidate_source)?.results
        }
        OutputKind::Candidates => {
            candidate_database(&options.db_path, &options.query, options.candidate_source)?
        }
    };
    serde_json::to_writer(io::stdout().lock(), &output)?;
    writeln!(io::stdout().lock())?;
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("mojidata-idsfind: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn parses_compatible_cli_protocol() {
        let options = parse_args(args(&[
            "--db",
            "idsfind.db",
            "--query-json",
            "[\"⿰火土\"]",
            "--candidate-source",
            "all",
        ]))
        .unwrap();
        assert_eq!(options.db_path, PathBuf::from("idsfind.db"));
        assert_eq!(options.candidate_source, CandidateSource::All);
        assert_eq!(options.output_kind, OutputKind::Results);
        assert!(
            options
                .query
                .matches(&["⿰".into(), "火".into(), "土".into()])
        );
    }

    #[test]
    fn parses_candidate_diagnostic_output() {
        let options = parse_args(args(&[
            "--db",
            "idsfind.db",
            "--query-json",
            "[\"⿰火土\"]",
            "--output-kind",
            "candidates",
        ]))
        .unwrap();
        assert_eq!(options.output_kind, OutputKind::Candidates);
    }

    #[test]
    fn rejects_malformed_protocol_input() {
        assert!(parse_args(args(&["--query-json", "[]"])).is_err());
        assert!(parse_args(args(&["--db", "idsfind.db", "--query-json", "not-json"])).is_err());
        assert!(
            parse_args(args(&[
                "--db",
                "idsfind.db",
                "--query-json",
                "[]",
                "--other",
                "x"
            ]))
            .is_err()
        );
    }
}
