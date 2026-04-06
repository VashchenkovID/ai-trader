from app.core.config import Settings, get_settings
from app.repositories.market_repository import MarketRepository
from app.repositories.news_repository import NewsRepository
from app.repositories.performance_repository import PerformanceRepository
from app.repositories.profitability_repository import ProfitabilityRepository
from app.repositories.trading_request_repository import TradingRequestRepository
from app.repositories.virtual_portfolio_repository import VirtualPortfolioRepository
from app.services.auth_service import AuthService
from app.services.market_service import MarketService
from app.services.news_service import NewsService
from app.services.performance_service import PerformanceService
from app.services.profitability_service import ProfitabilityService
from app.services.settings_service import SettingsService
from app.services.auto_paper_service import AutoPaperService
from app.services.recommendation_pipeline_service import RecommendationPipelineService
from app.services.preflight_service import PreflightService
from app.services.ops_service import OpsService
from app.services.risk_service import RiskService
from app.services.trading_mode_service import TradingModeService
from app.services.trading_request_service import TradingRequestService
from app.services.virtual_portfolio_service import VirtualPortfolioService
from app.services.tinkoff_client import TinkoffApiClient
from app.services.telegram_service import TelegramConfig, TelegramService


class AppContainer:
    """Контейнер с долгоживущими сервисами, которые переиспользуются роутами."""
    def __init__(self, settings: Settings) -> None:
        """Создает экземпляры сервисов, доступные через `app.state.container`."""
        self.settings = settings
        self.ops_service = OpsService(
            backup_rollup_path=settings.cutover_backup_rollup_path,
            backup_keep_raw=settings.cutover_backup_keep_raw,
        )
        self.market_repository = MarketRepository()
        self.news_repository = NewsRepository()
        self.performance_repository = PerformanceRepository()
        self.profitability_repository = ProfitabilityRepository()
        self.trading_request_repository = TradingRequestRepository()
        self.virtual_portfolio_repository = VirtualPortfolioRepository()
        self.virtual_portfolio_service = VirtualPortfolioService(
            market_repo=self.market_repository,
            repo=self.virtual_portfolio_repository,
        )
        self.auth_service = AuthService(settings=settings)
        self.settings_service = SettingsService()
        self.market_service = MarketService(repository=self.market_repository)
        self.news_service = NewsService(repository=self.news_repository)
        self.performance_service = PerformanceService(repository=self.performance_repository)
        self.profitability_service = ProfitabilityService(repository=self.profitability_repository)
        self.risk_service = RiskService(settings_service=self.settings_service)
        self.trading_request_service = TradingRequestService(
            trading_repo=self.trading_request_repository,
            market_repo=self.market_repository,
            risk_service=self.risk_service,
            virtual_portfolio_service=self.virtual_portfolio_service,
        )
        self.trading_mode_service = TradingModeService(settings_service=self.settings_service)
        self.tinkoff_client: TinkoffApiClient | None = (
            TinkoffApiClient(
                base_url=settings.tinkoff_api_url,
                token=settings.tinkoff_token,
                account_id=settings.tinkoff_account_id,
                verify_ssl=settings.tinkoff_verify_ssl,
            )
            if settings.tinkoff_token
            else None
        )
        self.auto_paper_service = AutoPaperService(
            settings_service=self.settings_service,
            trading_mode_service=self.trading_mode_service,
            trading_repo=self.trading_request_repository,
            trading_request_service=self.trading_request_service,
            risk_service=self.risk_service,
            virtual_portfolio_service=self.virtual_portfolio_service,
        )
        self.preflight_service = PreflightService(
            risk_service=self.risk_service,
            trading_mode_service=self.trading_mode_service,
            auto_paper_service=self.auto_paper_service,
        )
        self.recommendation_pipeline_service = RecommendationPipelineService(
            trading_service=self.trading_request_service,
            market_repo=self.market_repository,
            trading_repo=self.trading_request_repository,
            auto_paper_service=self.auto_paper_service,
        )
        self.telegram_service = TelegramService(
            TelegramConfig(
                token=settings.telegram_bot_token,
                default_chat_id=settings.telegram_chat_id,
                enabled=settings.telegram_enabled,
            )
        )


def build_container() -> AppContainer:
    """Собирает контейнер приложения с настройками из окружения."""
    return AppContainer(settings=get_settings())
