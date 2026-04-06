"""
AceTrack - Application Configuration.

Centralizes all settings: database, WaSender API, file paths, plant/company
mappings, and timezone. Values can be overridden via environment variables or
a .env file placed next to this module.
"""

from __future__ import annotations

from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings backed by environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ────────────────────────────────────────────────────────
    DATABASE_URL: str = (
        "postgresql://postgres:postgres@localhost:5434/acetech"
    )

    # ── WaSender WhatsApp API ───────────────────────────────────────────
    WASENDER_API_KEY: str = (
        "e574e045dadc1fc6d83c2081682fb01f934646e54c302d39faf98596b48554a6"
    )
    WASENDER_URL: str = "https://wasenderapi.com/api/send-message"

    # ── File paths (default locations on the production server) ─────────
    SALES_CSV_PATH: str = (
        "C:/Users/Administrator/Desktop/Reports/Sales by Billing.csv"
    )
    BAYWISE_CSV_PATH: str = (
        "C:/Users/Administrator/Desktop/Reports/Baywiseoutput.csv"
    )

    # ── Timezone ────────────────────────────────────────────────────────
    TIMEZONE: str = "Asia/Kolkata"

    # ── Static mappings (not settable via env) ──────────────────────────
    PLANT_TO_COMPANY: ClassVar[dict[str, str]] = {
        "AM03": "AMC",
        "AM07": "AMC",
        "AP01": "APE",
        "AH05": "AHF",
    }

    COMPANY_LOCATIONS: ClassVar[dict[str, str]] = {
        "AMC": "Coimbatore",
        "APE": "Coimbatore",
        "AHF": "Chennai",
    }

    VALID_PLANTS: ClassVar[list[str]] = ["AM03", "AM07", "AP01", "AH05"]
    VALID_COMPANIES: ClassVar[list[str]] = ["AMC", "APE", "AHF"]

    # ── Billing-cycle constants ─────────────────────────────────────────
    BILLING_CYCLE_START_DAY: ClassVar[int] = 26  # 26th of previous month
    BILLING_CYCLE_END_DAY: ClassVar[int] = 25    # 25th of current month

    # ── Priority thresholds (percentage of target achieved) ─────────────
    PRIORITY_THRESHOLDS: ClassVar[dict[str, tuple[float, float]]] = {
        "ZERO": (0.0, 0.0),
        "Critical": (0.0, 50.0),
        "High": (50.0, 75.0),
        "Medium": (75.0, 90.0),
        "Low": (90.0, 100.0),
        "On Target": (100.0, float("inf")),
    }

    # ── helpers ─────────────────────────────────────────────────────────
    def company_for_plant(self, plant: str) -> str | None:
        """Return the company code for a given SAP plant code."""
        return self.PLANT_TO_COMPANY.get(plant)

    def location_for_company(self, company: str) -> str | None:
        """Return the city/location for a given company code."""
        return self.COMPANY_LOCATIONS.get(company)

    @staticmethod
    def calculate_priority(pct: float) -> str:
        """Return the priority label for a given performance percentage."""
        if pct == 0:
            return "ZERO"
        if pct < 50:
            return "Critical"
        if pct < 75:
            return "High"
        if pct < 90:
            return "Medium"
        if pct < 100:
            return "Low"
        return "On Target"


# Singleton instance used throughout the application.
settings = Settings()
