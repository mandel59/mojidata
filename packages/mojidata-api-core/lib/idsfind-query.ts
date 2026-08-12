export const idsfindPatternQueryContext = `
with tokens as (
    select
        idslist.key as key0,
        ts0.key as key1,
        ts.key as key,
        ts.value as token
    from json_each($idslist) as idslist
    join json_each(idslist.value) as ts0
    join json_each(ts0.value) as ts
),
decomposed as (
    select
        tokens.key0,
        tokens.key1,
        tokens.key,
        ifnull(idsfind.IDS_tokens, tokens.token) as tokens
    from tokens left join idsfind on idsfind.UCS = tokens.token
),
combinations as (
    select
        decomposed.key0,
        decomposed.key1,
        tokens,
        0 as level
    from decomposed where decomposed.key = 0
    union all
    select
        decomposed.key0,
        decomposed.key1,
        combinations.tokens || ' ' || decomposed.tokens,
        decomposed.key
    from combinations join decomposed
    where
        decomposed.key0 = combinations.key0
        and
        decomposed.key1 = combinations.key1
        and
        decomposed.key = combinations.level + 1
),
patterns as (
    select
        combinations.key0,
        combinations.key1,
        group_concat('("' || replace(replace(replace(replace(tokens, ' ？ ', '" AND "'), '？ ', ''), '" AND "？', ''), ' ？', '') || '")', ' OR ') as pattern
    from combinations
    where level = (
        select max(decomposed.key)
        from decomposed
        where decomposed.key0 = combinations.key0
          and decomposed.key1 = combinations.key1
    )
    group by key0, key1
),
token_pattern as (
    select group_concat('(' || pattern || ')', ' AND ') as pattern
    from (
        select key0, group_concat('(' || pattern || ')', ' OR ') as pattern
        from patterns
        group by key0
    )
)
`

export const idsfindQueryContext = `
${idsfindPatternQueryContext},
results as (
    select distinct idsfind.UCS AS UCS
    from idsfind_fts
    join token_pattern
    join idsfind on idsfind.rowid = idsfind_fts.rowid
    where idsfind_fts match pattern
)
`

export function makeIdsfindQuery(queryBody: string) {
  return `${idsfindQueryContext}\n${queryBody}`
}

export const idsfindQuery = makeIdsfindQuery(`select UCS from results`)

export const idsfindPatternQuery =
  `${idsfindPatternQueryContext}
select pattern from token_pattern`

const idsfindWholeLiteralContext =
  `${idsfindPatternQueryContext},
complete_combinations as (
  select tokens
  from combinations
  where key0 = 0
    and key1 = 0
    and level = (
      select max(decomposed.key)
      from decomposed
      where decomposed.key0 = combinations.key0
        and decomposed.key1 = combinations.key1
    )
)`

export const idsfindWholeLiteralQuery =
  `${idsfindWholeLiteralContext}
select distinct idsfind.UCS as UCS
from complete_combinations
cross join idsfind indexed by idsfind_IDS_tokens
where idsfind.IDS_tokens = substr(
    complete_combinations.tokens,
    3,
    length(complete_combinations.tokens) - 4
  )`

export const idsfindWholeLiteralScanQuery =
  `${idsfindWholeLiteralContext}
select distinct idsfind.UCS as UCS
from complete_combinations
cross join idsfind not indexed
where idsfind.IDS_tokens = substr(
    complete_combinations.tokens,
    3,
    length(complete_combinations.tokens) - 4
  )`

export const idsfindPatternAnalysisQuery =
  `${idsfindPatternQueryContext}
select
  pattern,
  (
    select count(*)
    from combinations
    where level = (
      select max(decomposed.key)
      from decomposed
      where decomposed.key0 = combinations.key0
        and decomposed.key1 = combinations.key1
    )
  ) as phrase_count,
  (
    select min(length(tokens) - length(replace(tokens, ' ', '')) + 1)
    from combinations
    where level = (
      select max(decomposed.key)
      from decomposed
      where decomposed.key0 = combinations.key0
        and decomposed.key1 = combinations.key1
    )
  ) as min_phrase_tokens,
  (
    select max(length(tokens) - length(replace(tokens, ' ', '')) + 1)
    from combinations
    where level = (
      select max(decomposed.key)
      from decomposed
      where decomposed.key0 = combinations.key0
        and decomposed.key1 = combinations.key1
    )
  ) as max_phrase_tokens
from token_pattern`

export const idsfindDirectQuery = `
select distinct idsfind.UCS AS UCS
from idsfind_fts
join idsfind on idsfind.rowid = idsfind_fts.rowid
where idsfind_fts match $pattern
`

export const idsfindStructuralQuery = makeIdsfindQuery(`
select distinct results.UCS as UCS
from results
join idsfind on idsfind.UCS = results.UCS
join idsfind_structural_fts on idsfind_structural_fts.rowid = idsfind.rowid
where idsfind_structural_fts match $structural_pattern
`)
