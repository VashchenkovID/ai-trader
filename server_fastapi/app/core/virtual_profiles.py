"""Имена виртуальных профилей (REWRITE_CORE §13)."""

VIRTUAL_PROFILE_SLUGS: tuple[str, ...] = (
    "conservative",
    "moderate",
    "aggressive",
    "experimental",
)

DEFAULT_VIRTUAL_PROFILE = "moderate"


def normalize_virtual_profile(slug: str | None) -> str:
    s = (slug or "").strip().lower() or DEFAULT_VIRTUAL_PROFILE
    if s in VIRTUAL_PROFILE_SLUGS:
        return s
    return DEFAULT_VIRTUAL_PROFILE
