use std::error::Error;
use std::io;

const ANCHOR: &str = "§";
const WILDCARD: &str = "？";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Query {
    tokens: Vec<String>,
    anchored_at_root: bool,
}

fn invalid_query(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(io::Error::new(io::ErrorKind::InvalidInput, message.into()))
}

impl Query {
    pub fn parse_group(values: &[String]) -> Result<Self, Box<dyn Error>> {
        if values.len() != 1 {
            return Err(invalid_query(
                "native common-fragment search requires exactly one query group",
            ));
        }
        Self::parse(&values[0])
    }

    pub fn parse(text: &str) -> Result<Self, Box<dyn Error>> {
        if text.contains(['*', '＊', '×']) {
            return Err(invalid_query(
                "multiplicity is outside the native common fragment",
            ));
        }
        let tokens = tokenize(text)?;
        if tokens.is_empty() {
            return Err(invalid_query("query must contain one IDS pattern"));
        }
        if tokens.iter().any(|token| is_variable(token)) {
            return Err(invalid_query(
                "variables are outside the native common fragment",
            ));
        }
        if tokens
            .iter()
            .filter(|token| token.as_str() == WILDCARD)
            .count()
            > 1
        {
            return Err(invalid_query(
                "the native common fragment supports at most one wildcard",
            ));
        }

        let anchored_at_root = tokens.first().is_some_and(|token| token == ANCHOR);
        let ends_with_anchor = tokens.last().is_some_and(|token| token == ANCHOR);
        if anchored_at_root != ends_with_anchor {
            return Err(invalid_query("root anchors must occur at both ends"));
        }
        let anchor_count = tokens
            .iter()
            .filter(|token| token.as_str() == ANCHOR)
            .count();
        if anchor_count != if anchored_at_root { 2 } else { 0 } {
            return Err(invalid_query("root anchors are only allowed at both ends"));
        }
        let core = if anchored_at_root {
            &tokens[1..tokens.len() - 1]
        } else {
            &tokens[..]
        };
        if core.is_empty() || node_length(core, 0) != Some(core.len()) {
            return Err(invalid_query("query must be one complete IDS tree"));
        }
        Ok(Self {
            tokens,
            anchored_at_root,
        })
    }

    pub fn fts5_pattern(&self) -> String {
        let phrases = self
            .tokens
            .split(|token| token == WILDCARD)
            .filter(|tokens| !tokens.is_empty())
            .map(|tokens| {
                let phrase = tokens
                    .iter()
                    .map(|token| token.replace('"', "\"\""))
                    .collect::<Vec<_>>()
                    .join(" ");
                format!("\"{phrase}\"")
            })
            .collect::<Vec<_>>();
        if phrases.is_empty() {
            String::new()
        } else {
            phrases.join(" AND ")
        }
    }

    pub fn matches(&self, target: &[String]) -> bool {
        let end = if self.anchored_at_root {
            usize::from(!target.is_empty())
        } else {
            target.len()
        };
        (0..end).any(|start| self.matches_from(target, start))
    }

    fn matches_from(&self, target: &[String], start: usize) -> bool {
        let mut cursor = start;
        for token in &self.tokens {
            match token.as_str() {
                ANCHOR => {
                    if cursor != 0 && cursor != target.len() {
                        return false;
                    }
                }
                WILDCARD => {
                    let Some(length) = node_length(target, cursor) else {
                        return false;
                    };
                    cursor += length;
                }
                literal => {
                    if target.get(cursor).map(String::as_str) != Some(literal) {
                        return false;
                    }
                    cursor += 1;
                }
            }
        }
        cursor <= target.len()
    }
}

fn is_variable(token: &str) -> bool {
    let mut chars = token.chars();
    let Some(value) = chars.next() else {
        return false;
    };
    chars.next().is_none() && (value.is_ascii_lowercase() || ('ａ'..='ｚ').contains(&value))
}

fn is_variation_selector(value: char) -> bool {
    ('\u{fe00}'..='\u{fe0f}').contains(&value) || ('\u{e0100}'..='\u{e01ef}').contains(&value)
}

fn tokenize(text: &str) -> Result<Vec<String>, Box<dyn Error>> {
    let mut out: Vec<String> = Vec::new();
    let mut chars = text.char_indices().peekable();
    while let Some((start, value)) = chars.next() {
        if value.is_whitespace() {
            continue;
        }
        if value == '&' {
            let mut end = None;
            for (index, next) in chars.by_ref() {
                if next == ';' {
                    end = Some(index + next.len_utf8());
                    break;
                }
            }
            let end = end.ok_or_else(|| invalid_query("unterminated entity token"))?;
            out.push(text[start..end].to_string());
            continue;
        }
        if value == '{' {
            let mut end = None;
            let mut has_digit = false;
            for (index, next) in chars.by_ref() {
                if next == '}' {
                    end = Some(index + next.len_utf8());
                    break;
                }
                if !next.is_ascii_digit() {
                    return Err(invalid_query("brace tokens must contain decimal digits"));
                }
                has_digit = true;
            }
            let end = end.ok_or_else(|| invalid_query("unterminated brace token"))?;
            if !has_digit {
                return Err(invalid_query("brace tokens must not be empty"));
            }
            out.push(text[start..end].to_string());
            continue;
        }
        if value == '@' {
            let Some((_, direction)) = chars.next() else {
                return Err(invalid_query("incomplete positional operator"));
            };
            if !matches!(
                direction.to_ascii_uppercase(),
                'T' | 'B' | 'L' | 'R' | 'M' | 'I' | 'O'
            ) {
                return Err(invalid_query("unknown positional operator"));
            }
            return Err(invalid_query(
                "positional operators are outside the native common fragment",
            ));
        }
        if is_variation_selector(value) {
            let previous = out
                .last_mut()
                .ok_or_else(|| invalid_query("variation selector has no base token"))?;
            previous.push(value);
        } else {
            out.push(value.to_string());
        }
    }
    Ok(out)
}

pub fn node_length(tokens: &[String], start: usize) -> Option<usize> {
    if start >= tokens.len() {
        return None;
    }
    let mut remaining = 1usize;
    let mut cursor = start;
    while remaining > 0 {
        let token = tokens.get(cursor)?;
        cursor += 1;
        remaining -= 1;
        remaining = remaining.checked_add(token_arity(token))?;
    }
    Some(cursor - start)
}

fn token_arity(token: &str) -> usize {
    match token {
        "〾" | "⿾" | "⿿" | "↔" | "↷" | "@L" | "@R" | "@T" | "@B" | "@M" | "@I" | "@O" => 1,
        "⿰" | "⿱" | "⿴" | "⿵" | "⿶" | "⿷" | "⿸" | "⿹" | "⿺" | "⿻" | "⿼" | "⿽"
        | "㇯" | "⊖" => 2,
        "⿲" | "⿳" | "&OL3;" => 3,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens(text: &str) -> Vec<String> {
        tokenize(text).unwrap()
    }

    #[test]
    fn parses_supported_fragment_and_compiles_fts_pattern() {
        let query = Query::parse("§⿰？心§").unwrap();
        assert_eq!(query.fts5_pattern(), "\"§ ⿰\" AND \"心 §\"");
    }

    #[test]
    fn rejects_syntax_outside_frozen_fragment() {
        assert!(Query::parse_group(&[]).is_err());
        assert!(Query::parse("⿰x心").is_err());
        assert!(Query::parse("⿰？？").is_err());
        assert!(Query::parse("§⿰火土").is_err());
        assert!(Query::parse("⿰火").is_err());
    }

    #[test]
    fn exact_match_distinguishes_root_and_fragment() {
        let target = tokens("⿱木⿰火土");
        assert!(Query::parse("⿰火土").unwrap().matches(&target));
        assert!(Query::parse("⿱木？").unwrap().matches(&target));
        assert!(Query::parse("§⿱木？§").unwrap().matches(&target));
        assert!(!Query::parse("§⿰火土§").unwrap().matches(&target));
        assert!(!Query::parse("⿰土火").unwrap().matches(&target));
    }

    #[test]
    fn exact_match_rejects_incomplete_target_nodes() {
        assert!(!Query::parse("§？§").unwrap().matches(&tokens("⿰火")));
    }

    #[test]
    fn tokenizer_keeps_entities_and_variation_sequences_atomic() {
        assert_eq!(tokens("⿰&CDP-8BF5;木󠄀"), vec!["⿰", "&CDP-8BF5;", "木󠄀"]);
    }
}
