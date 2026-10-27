# Huawei SKU configurations on TPC Skyline

`/ubenchx/tpc-skyline` and its `/zh` sibling retain NVIDIA measured TPC/GPC groupings and add a separate Huawei 950PR table. The URL and `test=tpc-skyline` remain compatible. No inference catalog hardware entries or performance ceilings are introduced.

## Evidence

The nine rows are transcribed from a contributor-supplied screenshot received 27 October 2026. The original image is preserved at `packages/app/public/data/ubenchx/950pr-sku-comparison-20261027.png`; its digest is recorded in `HUAWEI_SKU_SOURCE`. Original publisher and revision are unverified. The table is not a complete SKU catalog, does not establish binning/partitioning, and cannot identify core IDs or sharing groups.

PR_9579 links to existing measured core profiles. Those measurements cover 28 Cube and 56 Vector IDs, split into two groups of 14/28. No other row is marked as having core-profile measurements. Configuration values are not measured clocks or available memory at runtime.

AI Core count equals Cube count in every row. Cube/Vector clocks and DDR Base/Read/Write values are equal within each row, so the UI combines those columns; the API retains each field. Frequency is interpreted as MHz. DDR Rate units are absent and remain null; no bandwidth is derived. PR_957c retains the source's 84 GiB memory and 112 MiB L2. Virtualisation options are reproduced without inferring their meaning.

## View/API coverage

- NVIDIA table: existing `gpus`, unchanged.
- Huawei table: `skuConfigurations`, produced by the same helper in UI and API.
- `gpu=all` or `gpu=Huawei 950PR`: all nine configurations; exact `Ascend 950PR_<suffix>`: one. NVIDIA filters return an empty configuration array.
- `test=all` returns the same filtered array within `tpcSkyline`; devices without other measurements keep empty arrays in those sections.
- The source image remains available through API metadata; its page footer is omitted. The profile link and table scrolling are presentation-only, with no new data filters.
- No inference or unofficial-run overlay is involved: this is static, explicitly sourced hardware configuration evidence.
