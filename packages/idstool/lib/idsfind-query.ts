export const query = `
with tokens as (
    select
        idslist.key as key0,
        ts.key as key,
        ts.value as token
    from json_each($idslist) as idslist
    join json_each(idslist.value) as ts
),
decomposed as (
    select
        tokens.key0,
        tokens.key,
        ifnull(idsfind.IDS_tokens, tokens.token) as tokens
    from tokens left join idsfind on idsfind.UCS = tokens.token
),
combinations as (
    select
        decomposed.key0,
        tokens,
        0 as level
    from decomposed where decomposed.key = 0
    union all
    select
        decomposed.key0,
        combinations.tokens || ' ' || decomposed.tokens,
        decomposed.key
    from combinations join decomposed
    where
        decomposed.key0 = combinations.key0
        and
        decomposed.key = combinations.level + 1
),
patterns as (
    select
        combinations.key0,
        group_concat('"' || tokens || '"', ' OR ') as pattern
    from combinations
    where level = (
        select max(decomposed.key)
        from decomposed
        where decomposed.key0 = combinations.key0
    )
    group by key0
)
select char(docid) AS UCS
from idsfind_fts
where IDS_tokens match (
    select group_concat('(' || pattern || ')', ' AND ') as pattern
    from patterns
)
`
