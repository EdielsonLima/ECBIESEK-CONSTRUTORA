# Mapeamento Empresas e Centros de Custo

Fonte: `SELECT * FROM dim_centrocusto JOIN dim_empresa`. Atualizar quando mudar cadastro.

## Como interpretar

- **codigo** = `id_sienge_centrocusto` — mostrar ao usuario como "codigo CC"
- **id_interno** = `id_interno_centrocusto` — usar em queries SQL

## ECBIESEK-CONSTRUTORA

| Codigo | id_interno | Centro de Custo | Ativo |
|--------|-----------|-----------------|-------|
| (preencher via: SELECT cc.id_sienge_centrocusto, cc.id_interno_centrocusto, cc.nome, cc.ativo FROM dim_centrocusto cc JOIN dim_empresa e USING (id_interno_empresa) WHERE e.nome ILIKE '%ecbiesek%' ORDER BY cc.id_sienge_centrocusto) | | | |

**Exemplo conhecido**: Lake Boulevard — codigo=16, id_interno=19, empresa ECBIESEK.

## WALE

| Codigo | id_interno | Centro de Custo | Ativo |
|--------|-----------|-----------------|-------|
| (preencher via query acima com WHERE e.nome ILIKE '%wale%') | | | |

## INOTEC

| Codigo | id_interno | Centro de Custo | Ativo |
|--------|-----------|-----------------|-------|
| (preencher via query acima com WHERE e.nome ILIKE '%inotec%') | | | |

## Empresas excluidas (nao entram em relatorios)

Listar a partir de:
```sql
SELECT e.nome FROM config_empresas_excluidas ce JOIN dim_empresa e USING (id_interno_empresa);
```

## Nota de atualizacao

Este arquivo deve ser atualizado quando novos empreendimentos (CCs) forem cadastrados no Sienge.
Query de atualizacao completa:
```sql
SELECT
    e.nome AS empresa,
    cc.id_sienge_centrocusto AS codigo_sienge,
    cc.id_interno_centrocusto AS id_interno,
    cc.nome AS centro_custo,
    cc.ativo
FROM dim_centrocusto cc
JOIN dim_empresa e USING (id_interno_empresa)
ORDER BY e.nome, cc.id_sienge_centrocusto;
```
