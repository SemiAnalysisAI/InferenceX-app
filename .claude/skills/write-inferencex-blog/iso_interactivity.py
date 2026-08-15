#!/usr/bin/env python3
"""
Iso-interactivity interpolation helper for InferenceX blog posts.

Mirrors EXACTLY the algorithm used by the live dashboard chart code at
packages/app/src/components/calculator/interpolation.ts and
packages/app/src/components/inference/hooks/useInterpolatedTrendData.ts.

Pipeline:
  1. Build the upper-left Pareto frontier on (interactivity, throughput).
  2. Sort the frontier by interactivity ascending.
  3. Build monotone cubic Hermite slopes (Steffen 1990 method, same as
     d3.curveMonotoneX) over the frontier knots for the metric of interest.
  4. Evaluate the Hermite spline at the target interactivity.
  5. Return None if target is OUTSIDE [frontier_min_x, frontier_max_x]
     — the chart code does not extrapolate. Blog tables should render
     this as `_unreachable_` for that interactivity row.
  6. Clamp the interpolated metric value to [min(ys), max(ys)] of the
     frontier to prevent cubic-spline overshoots above/below the data.

Reciprocal metrics ($/M tok, J/token) are a special case: they are a per-chip
constant divided by a throughput, so they are NOT splined independently. Two
independent splines need not preserve `metric * throughput = constant` between
measured knots. Pass `reciprocal_of='throughput'` (or the matching output/input
throughput key) to spline that throughput and re-derive the metric, which is what
the dashboard does. See docs/tco-calculator.md for a reproducible measurement.

Usage as a module:
    from iso_interactivity import interpolate_metric, pareto_front_upper_left
    # points: list of dicts with at least 'interactivity' and 'throughput',
    # plus whatever metric you want to interpolate.
    # cost/energy are reciprocal in throughput — name the throughput they divide
    cost = interpolate_metric(points, target_iv=18.0, metric_key='cost_per_M',
                              reciprocal_of='throughput')

Usage as a script (JSON input on stdin, JSON output on stdout):
    echo '{"points":[...], "target_iv":18.0, "metric_key":"throughput"}' \\
      | python3 iso_interactivity.py

If extending: keep this file 1:1 with the TS reference. If the chart's
interpolation changes, update both at once.
"""

from __future__ import annotations
import json
import sys
from typing import Callable, Iterable, Optional


def pareto_front_upper_left(
    points: list[dict],
    get_x: Callable[[dict], float],
    get_y: Callable[[dict], float],
) -> list[dict]:
    """Upper-left Pareto frontier. For (interactivity, throughput): for
    decreasing x, y must be strictly increasing.

    Mirrors paretoFrontUpperLeft() in
    packages/app/src/components/calculator/interpolation.ts.
    """
    if not points:
        return []

    # Sort by x ascending; ties broken by y descending so we keep the
    # higher-y point when xs collide.
    sorted_pts = sorted(points, key=lambda p: (get_x(p), -get_y(p)))

    front: list[dict] = []
    for p in sorted_pts:
        px, py = get_x(p), get_y(p)
        if front and get_x(front[-1]) == px:
            # Same x — keep whichever has higher y
            if py > get_y(front[-1]):
                front[-1] = p
            continue
        # Pop any tail point whose y is <= current y (current dominates)
        while front and py >= get_y(front[-1]):
            front.pop()
        front.append(p)
    return front


def _sign(x: float) -> int:
    return -1 if x < 0 else 1


def monotone_slopes(xs: list[float], ys: list[float]) -> list[float]:
    """Steffen 1990 monotone cubic Hermite slopes. Matches d3.curveMonotoneX
    via monotoneSlopes() in interpolation.ts."""
    n = len(xs)
    if n < 2:
        return [0.0] * n

    h: list[float] = []
    s: list[float] = []
    for i in range(n - 1):
        hi = xs[i + 1] - xs[i]
        h.append(hi)
        s.append(0.0 if hi == 0 else (ys[i + 1] - ys[i]) / hi)

    m = [0.0] * n
    for i in range(1, n - 1):
        s0, s1 = s[i - 1], s[i]
        h0, h1 = h[i - 1], h[i]
        denom = h0 + h1
        p = (s0 * h1 + s1 * h0) / denom if denom else 0.0
        slope = (_sign(s0) + _sign(s1)) * min(abs(s0), abs(s1), 0.5 * abs(p))
        m[i] = slope if slope else 0.0

    m[0] = (3 * s[0] - m[1]) / 2 if h[0] else m[1]
    m[n - 1] = (3 * s[n - 2] - m[n - 2]) / 2 if h[n - 2] else m[n - 2]
    return m


def hermite_interpolate(
    xs: list[float],
    ys: list[float],
    m: list[float],
    target_x: float,
) -> float:
    """Evaluate the monotone cubic Hermite spline at target_x. xs must be
    sorted ascending with no duplicates. Mirrors hermiteInterpolate() in
    interpolation.ts."""
    n = len(xs)
    if n == 0:
        return 0.0
    if n == 1:
        return ys[0]
    if target_x <= xs[0]:
        return ys[0]
    if target_x >= xs[-1]:
        return ys[-1]

    lo, hi = 0, n - 1
    while lo < hi - 1:
        mid = (lo + hi) >> 1
        if xs[mid] <= target_x:
            lo = mid
        else:
            hi = mid

    hh = xs[hi] - xs[lo]
    if hh == 0:
        return ys[lo]
    t = (target_x - xs[lo]) / hh
    t2 = t * t
    t3 = t2 * t
    h00 = 2 * t3 - 3 * t2 + 1
    h10 = t3 - 2 * t2 + t
    h01 = -2 * t3 + 3 * t2
    h11 = t3 - t2
    return h00 * ys[lo] + h10 * hh * m[lo] + h01 * ys[hi] + h11 * hh * m[hi]


def recover_reciprocal_numerator(
    values: list[Optional[float]], throughputs: list[Optional[float]]
) -> Optional[float]:
    """Recover the constant `c` of a metric defined as `c / throughput`.

    1:1 with `recoverReciprocalNumerator` in
    packages/app/src/components/calculator/interpolation.ts. Returns None unless
    EVERY usable point agrees on the constant: the identity is what licenses
    re-deriving the metric, so data whose numerator actually varies per point
    must fall back to being splined directly.
    """
    # 0.1%, matching the TS side. Deliberately loose: blog tables are assembled
    # from costs written to a few decimals, and a tight gate would silently
    # reject them and fall back to splining. Still rejects a numerator that
    # genuinely varies per point (measured power moves by whole percent).
    relative_tolerance = 1e-3
    numerator: Optional[float] = None
    for value, throughput in zip(values, throughputs):
        if value is None or throughput is None:
            continue
        if not value > 0 or not throughput > 0:
            continue
        candidate = value * throughput
        if numerator is None:
            numerator = candidate
        elif abs(candidate - numerator) > abs(numerator) * relative_tolerance:
            return None
    return numerator


def interpolate_metric(
    points: list[dict],
    target_iv: float,
    metric_key: str = 'throughput',
    iv_key: str = 'interactivity',
    tput_key: str = 'throughput',
    reciprocal_of: Optional[str] = None,
) -> Optional[float]:
    """Interpolate `metric_key` at `target_iv` using the chart's algorithm.

    Returns None if target_iv is outside the frontier's [min_iv, max_iv] range —
    the chart code does not extrapolate. Blog tables should render this as
    `_unreachable_` in that row.

    The Pareto frontier is ALWAYS built on (interactivity, throughput) regardless
    of which metric you're interpolating — this matches the chart, where the
    frontier is defined by the upper-left throughput envelope and other metrics
    (cost, energy, TPOT, ...) are derived values at frontier points.

    `reciprocal_of` names the throughput key a metric divides, for metrics of the
    form `constant / throughput` ($/M tok, J/token). Set it for those metrics:
    that throughput is splined and the metric re-derived, matching the dashboard.
    Leave it None for metrics splined directly (throughput itself, tok/s/MW,
    latency, and measured energy — whose numerator varies per point).
    """
    if not points:
        return None

    frontier = pareto_front_upper_left(
        points,
        get_x=lambda p: p[iv_key],
        get_y=lambda p: p[tput_key],
    )
    if not frontier:
        return None

    sorted_front = sorted(frontier, key=lambda p: p[iv_key])
    xs = [p[iv_key] for p in sorted_front]

    # No extrapolation — must be within frontier x-range.
    if target_iv < xs[0] or target_iv > xs[-1]:
        return None

    if len(sorted_front) == 1:
        # Single point — return the metric only if x matches exactly
        if abs(target_iv - xs[0]) < 1e-6:
            return sorted_front[0].get(metric_key)
        return None

    # The TS helper returns null if any frontier point lacks the requested
    # metric. Do the same here: coercing a missing value to zero would create a
    # synthetic knot and make blog output diverge from the dashboard.
    ys: list[float] = []
    for point in sorted_front:
        value = point.get(metric_key)
        if value is None:
            return None
        ys.append(value)

    if reciprocal_of is not None:
        tputs: list[float] = []
        for point in sorted_front:
            throughput = point.get(reciprocal_of)
            if throughput is None:
                return None
            tputs.append(throughput)
        numerator = recover_reciprocal_numerator(ys, tputs)
        # None means these points do not obey the identity — fall through and
        # spline the metric directly, matching the TS fallback.
        if numerator is not None:
            tput_slopes = monotone_slopes(xs, tputs)
            tput = hermite_interpolate(xs, tputs, tput_slopes, target_iv)
            # Clamp the throughput, as the TS side does, then derive; cost then
            # cannot overshoot the frontier's own cost range either.
            tput = max(min(tputs), min(max(tputs), tput))
            if tput <= 0:
                return 0.0
            return numerator / tput

    slopes = monotone_slopes(xs, ys)
    raw = hermite_interpolate(xs, ys, slopes, target_iv)

    # Clamp to data range to prevent cubic-spline overshoot beyond the min/max
    # observed metric values on the frontier. This matches `interpolateForGPU`
    # in the calculator (which is the closest analog to blog iso-interactivity
    # tables) rather than `interpolateMetricAtInteractivity` in the trend chart
    # hook (which only does max(0, raw) and lets the spline overshoot upward).
    # The tighter clamp is more honest — readers should not see a published
    # value above the highest measured throughput on that date's frontier.
    return max(min(ys), min(max(ys), raw))


def _cli() -> None:
    """Stdin: {"points": [...], "target_iv": N, "metric_key": "...",
               "reciprocal_of": "throughput" for $/M tok and J/token}
    Stdout: {"value": N or null}"""
    req = json.loads(sys.stdin.read())
    value = interpolate_metric(
        req['points'],
        target_iv=float(req['target_iv']),
        metric_key=req.get('metric_key', 'throughput'),
        iv_key=req.get('iv_key', 'interactivity'),
        tput_key=req.get('tput_key', 'throughput'),
        reciprocal_of=req.get('reciprocal_of'),
    )
    json.dump({'value': value}, sys.stdout)
    sys.stdout.write('\n')


if __name__ == '__main__':
    _cli()
