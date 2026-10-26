# Huawei copy-bandwidth evidence

The displayed series is **Huawei 950PR**, measured on Ascend950PR_9579 (28 Cube, 56 Vector, 128 GiB). The measured SKU remains in API metadata. This series does not change the global GPU specification catalog or inference-data normalization.

`huawei-bandwidth.json` preserves all 42 full-precision plotted points, source input hashes, per-process medians, observed p10/p90 ranges, pool geometry and sample counts. Each size has three processes × six blocks × twenty observations. Aggregation is the pooled median amortized time, converted by `2 * message bytes / time`; bounds invert p90/p10 latency and are not confidence intervals. No observations are smoothed or supplied for missing sizes. The source is the validated October 7 rotating-pool 950PR experiment; the initial scratch-fill curves and overlap-rejected runs are excluded.

The experiment uses FP16 `copy_` operations in complete rotating-pool NPU graph replays. Each direction has at least 512 MiB and two slots. Every block is checked against source bits before and after timing. The time is amortized over a complete rotation, not an isolated-copy latency. Unlike the GPU series, it is not `triton.testing.do_bench` on one FP32 buffer pair. The UI states this above the chart and labels Huawei tooltip times as amortized. No physical HBM-traffic counters prove that every access misses cache.

The endpoint is about 1,447 GB/s at 16 GiB. MBU uses an assumed nominal reference of 1,600 GB/s; the exact board ceiling was not independently measured.

UI/API coverage: the existing bandwidth/MBU/latency selector is presentation-only. `Huawei 950PR` is available through `test=mem-bw`, `gpu=<key>` and `gpu=all`; `test=all` returns empty sections for tests unavailable on an explicitly selected device. API rows retain optional uncertainty/pool fields, `metadata.protocol`, `dtype`, CANN/torch_npu versions and `missingSizesBytes`. `peakBandwidthSource` states the per-run reference qualification. The dashboard and API share `transformUbenchxRun`.

Hover rulers use the currently selected metric and the same scaled coordinates as the displayed point, including after zoom.
