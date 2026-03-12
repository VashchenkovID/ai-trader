from collections import defaultdict
from dataclasses import dataclass, field
from time import perf_counter


@dataclass
class RouteMetric:
    count: int = 0
    error_count: int = 0
    latency_sum_ms: float = 0.0
    latency_max_ms: float = 0.0
    latencies_ms: list[float] = field(default_factory=list)

    def record(self, latency_ms: float, is_error: bool) -> None:
        self.count += 1
        self.latency_sum_ms += latency_ms
        self.latency_max_ms = max(self.latency_max_ms, latency_ms)
        self.latencies_ms.append(latency_ms)
        if len(self.latencies_ms) > 200:
            self.latencies_ms.pop(0)
        if is_error:
            self.error_count += 1

    @property
    def avg_latency_ms(self) -> float:
        if self.count == 0:
            return 0.0
        return self.latency_sum_ms / self.count

    @property
    def error_rate(self) -> float:
        if self.count == 0:
            return 0.0
        return self.error_count / self.count


class MetricsRegistry:
    def __init__(self) -> None:
        self._routes: dict[str, RouteMetric] = defaultdict(RouteMetric)

    def start_timer(self) -> float:
        return perf_counter()

    def observe(self, route_key: str, started_at: float, status_code: int) -> None:
        latency_ms = (perf_counter() - started_at) * 1000
        self._routes[route_key].record(latency_ms=latency_ms, is_error=status_code >= 400)

    def snapshot(self) -> dict[str, dict[str, float | int]]:
        return {
            route_key: {
                "count": metric.count,
                "errorCount": metric.error_count,
                "errorRate": round(metric.error_rate, 4),
                "avgLatencyMs": round(metric.avg_latency_ms, 2),
                "maxLatencyMs": round(metric.latency_max_ms, 2),
                "p50LatencyMs": round(self._percentile(metric.latencies_ms, 50), 2),
                "p95LatencyMs": round(self._percentile(metric.latencies_ms, 95), 2),
                "p99LatencyMs": round(self._percentile(metric.latencies_ms, 99), 2),
            }
            for route_key, metric in sorted(self._routes.items())
        }

    def reset(self) -> None:
        self._routes.clear()

    @staticmethod
    def _percentile(values: list[float], percentile: int) -> float:
        if not values:
            return 0.0
        sorted_values = sorted(values)
        index = max(0, min(len(sorted_values) - 1, round((percentile / 100) * (len(sorted_values) - 1))))
        return sorted_values[index]
