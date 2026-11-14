# Base de basaltos da Terra (óxidos wt%)

Tabela pronta para comparar composição de basaltos terrestres com amostras da Lua e de Marte, no mesmo padrão: óxidos maiores em peso percent (`wt%`).

Compilada em 14 de novembro de 2026 (America/Sao_Paulo) a partir das compilacoes GEOROC de setembro de 2026 e da grade GLiM 0,5°.

## Arquivos deste pacote

| Arquivo | Conteúdo |
| --- | --- |
| `basaltos_terra.csv` | Tabela principal (pontos com química e coordenadas) |
| `basaltos_terra.geojson` | Os mesmos pontos em GeoJSON (CRS WGS84, lon/lat) |
| `basaltos_brasil.csv` | Subconjunto com `brasil = 1` |
| `basalto_glim_vb.geojson` | Células 0,5° da GLiM classificadas como `vb` (basic volcanics) |
| `mapa_basaltos.png` | Mapa-múndi dos pontos (Brasil em destaque) |
| `LEIAME.md` | Este texto |
| `processar_basaltos.py` | Script que gerou as tabelas |
| `processamento_stats.json` | Contagens intermediárias do processamento |
| `raw/rock_types/` | CSVs originais GEOROC (tipos de rocha) |
| `raw/cfb/` | CSVs originais GEOROC (flood basalts continentais) |
| `raw/glim/` | Grade GLiM 0,5° e nomes das classes |

## Colunas da tabela

| Coluna | Significado |
| --- | --- |
| `id` | Identificador GEOROC (`UNIQUE_ID`) |
| `sample_name` | Nome da amostra |
| `rock_name` | Nome da rocha na fonte |
| `tectonic_setting` | Ambiente tectônico (ex.: *continental flood basalt*) |
| `location` | Localidade / província segundo o GEOROC |
| `lat`, `lon` | Latitude e longitude em graus WGS84, média entre os campos mín. e máx. da fonte (os dois valores nem sempre vêm em ordem) |
| `SiO2`, `TiO2`, `Al2O3`, `FeOT`, `MgO`, `CaO`, `Na2O`, `K2O`, `P2O5` | Óxidos em `wt%` |
| `citation` | Chave(s) de citação do GEOROC, no formato `[número]` |
| `source_file` | CSV(s) de origem, separados por `\|` quando a amostra apareceu em mais de uma compilação |
| `brasil` | `1` se o ponto está no Brasil, `0` caso contrário |

`FeOT` é o ferro total expresso como FeO. Se o campo `FEOT(WT%)` existia, ele foi mantido. Se estava vazio, foi calculado como:

`FeOT = FeO + 0,8998 × Fe2O3`

(usando 0 quando só um dos dois estava presente). Valores numéricos da fonte que vinham com tag de citação (ex.: `48.2 [1234]`) foram lidos pelo primeiro número.

`Al2O3`, `CaO`, `Na2O`, `K2O` e `P2O5` podem estar vazios em algumas linhas; `SiO2`, `TiO2`, `FeOT` e `MgO` estão sempre preenchidos.

## Fontes e licenças

**Geoquímica (GEOROC / DIGIS, Universidade de Göttingen).** Compilações geradas em 1º de setembro de 2026.

- Tipos de rocha (BASALT partes 1–9, THOLEIITIC_BASALT partes 1–2, ALKALI_BASALT partes 1–2): [doi:10.25625/2JETOA](https://doi.org/10.25625/2jetoa)
- Flood basalts continentais, inclusive o arquivo Paraná (`2026-09-WSTPOX_PARANA.csv`): [doi:10.25625/WSTPOX](https://doi.org/10.25625/wstpox)
- Página de compilados: [georoc.eu/georoc/Compfiles.aspx](https://georoc.eu/georoc/Compfiles.aspx)

Licença dos dois conjuntos no Dataverse de Göttingen (verificada na metadada): **CC BY-SA 4.0** — [creativecommons.org/licenses/by-sa/4.0](http://creativecommons.org/licenses/by-sa/4.0). Ao reutilizar, cite o GEOROC e compartilhe derivados sob a mesma licença.

**Mapa litológico GLiM 0,5°** (Hartmann & Moosdorf, 2012):

- [doi:10.1594/PANGAEA.788537](https://doi.org/10.1594/PANGAEA.788537)
- Artigo: [doi:10.1029/2012GC004370](https://doi.org/10.1029/2012GC004370)
- Zip usado: [epic.awi.de/.../hartmann-moosdorf_2012.zip](https://epic.awi.de/id/eprint/31092/1/hartmann-moosdorf_2012.zip)

Licença no PANGAEA: **CC BY 3.0**. Na grade, o valor `2` corresponde à classe `vb` (*basic volcanics*, basaltos e vulcânicas máficas), conforme `raw/glim/Classnames.txt`. Foram exportadas 2560 células de 0,5° × 0,5°.

O mapa PNG usa o contorno do Brasil do [Natural Earth 50m](https://www.naturalearthdata.com/) (domínio público) só para desenho e para a flag `brasil`; o arquivo do Natural Earth não vai neste pacote.

## Filtros aplicados

1. Leitura de 13 CSVs de tipo de rocha + 45 CSVs de flood basalt continental (199.114 linhas após concatenar). Duas linhas com aspas malformadas foram ignoradas pelo parser.
2. Coordenadas válidas (latitude −90 a 90, longitude convertida para −180 a 180): restaram 182.808 linhas. 16.306 sem coordenadas aproveitáveis.
3. Pelo menos `SiO2`, `TiO2`, `FeOT` (já calculado) e `MgO` preenchidos: 153.457 linhas. 29.351 caíram neste passo.
4. Faixa basáltica de sanidade: `SiO2` entre 40 e 57 wt% (inclusive): 139.582 linhas. 13.875 ficaram de fora (mais ácidas ou mais ultrabásicas segundo a sílica).
5. Deduplicação por `UNIQUE_ID`: 120.135 amostras únicas (nenhum `id` estava vazio). Em empates, ficou a linha com mais óxidos preenchidos; `source_file` e `citation` foram unidos.

**Flag `brasil`:** o ponto cai no polígono do Brasil (Natural Earth 50m) com buffer de 0,4° (para coordenada grosseira e costa simplificada), ou o campo `location` cita BRAZIL / BRASIL / BRAZILIAN e o ponto está no retângulo folgado do país. Não basta a palavra “PARANA”: a província Paraná-Etendeka também ocorre no Paraguai, Uruguai e Argentina. Foram excluídos falsos amigos como “BRAZIL BASIN” (fundo oceânico) e “RIO BRASIL” (topônimo na Costa Rica).

## Contagens e medianas

Valores medidos nesta compilação (não arredondados além do que a mediana já implica):

- **Mundo:** 120.135 amostras. Medianas: FeOT **10,66** wt%, TiO2 **1,61** wt%, MgO **6,42** wt%, SiO2 **49,89** wt%.
- **Brasil:** 2.968 amostras. Medianas: FeOT **11,865** wt%, TiO2 **1,77** wt%, MgO **5,005** wt%, SiO2 **51,43** wt%.
- **GLiM `vb`:** 2.560 células de 0,5°.

No recorte brasileiro, 1.997 localidades citam “PARANA” e 209 citam explicitamente “SERRA GERAL” no campo `location` (muitas unidades da Serra Geral aparecem com outro nome de formação, como Gramado, Urubici ou Esmeralda).

## Como usar na comparação Lua / Marte

Compare os mesmos óxidos (`SiO2`, `TiO2`, `FeOT`, `MgO`, `CaO`, `Al2O3`). Na Lua, mapas do Lunar Prospector dão Ti e Mg como elemento, não como óxido: converta (`TiO2 ≈ 1,668 × Ti`; `MgO ≈ 1,658 × Mg`) antes de plotar contra esta tabela. Amostras Apollo/Astromat e APXS de Marte já vêm em óxidos e entram direto num gráfico FeOT vs TiO2 ou FeOT vs MgO.

A grade GLiM `vb` serve para recortar “onde há vulcânica máfica na superfície”, não para composição.

## Ressalvas

- Amostras GEOROC não são um grid regular: há superamostragem em dorças e ilhas muito estudadas (MORB, Havaí, Islândia, Deccan etc.).
- Várias coordenadas são grosseiras (às vezes 1°). Pontos da costa brasileira podem cair um pouco no mar; o buffer de 0,4° recupera a maior parte desses casos, mas a posição não substitui um mapa 1:1.000.000 do SGB.
- Não filtramos outliers de FeOT, MgO ou TiO2 (há FeOT de 0 a ~46 wt% e MgO até ~50 wt%). A única faixa química imposta foi a da sílica. Vale inspecionar picritos, cumulaados e análises duvidosas antes de calcular similaridade.
- `rock_name` e `tectonic_setting` vêm da fonte; a tabela mistura basaltos de dorsal, ilhas, platôs e dikes. Para o análogo da Serra Geral, filtre `location` ou `tectonic_setting`.
- Esta base é da **Terra**. Mapas e amostras da Lua e de Marte não estão neste zip.
