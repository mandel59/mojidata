export const queryContext = `
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
),
results as (
    select char AS UCS
    from idsfind_fts
    join token_pattern
    join idsfind_ref using (docid)
    where IDS_tokens match pattern
)
`

export const queryBody = `select UCS from results`

export function makeQuery(queryBody: string) {
    return `${queryContext}\n${queryBody}`
}

export const query = makeQuery(queryBody)
