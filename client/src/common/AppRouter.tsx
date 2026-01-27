import {FC} from "react";
import {Route, Routes} from "react-router-dom";
import Dashboard from '../pages/Dashboard/Dashboard.tsx'
// import EnhancedDashboardPage from '../pages/EnhancedDashboardPage' // File not found
// import NewDashboard from '../pages/NewDashboard' // File not found
import Portfolio from '../pages/Portfolio/Portfolio.tsx'
// import Market from '../pages/Market' // File not found
// import NeuralNetwork from '../pages/NeuralNetwork' // File not found
import Settings from '../pages/Settings'
// import Strategies from '../pages/Strategies' // File not found
// import ServerMonitoring from '../pages/ServerMonitoring' // File not found
// import TradingHours from '../pages/TradingHours' // File not found
import MetricsMonitoring from '../pages/MetricsMonitoring/MetricsMonitoring.tsx'
import Performance from '../pages/Performance/Performance.tsx'

const AppRouter: FC = () => {

    return (
        <>
            <Routes>
                <Route path="/" element={<Dashboard/>}/>
                <Route path="/dashboard" element={<Dashboard/>}/>
                <Route path="/old-dashboard" element={<Dashboard/>}/>
                {/* <Route path="/enhanced-dashboard" element={<EnhancedDashboardPage/>}/> */}
                <Route path="/portfolio" element={<Portfolio/>}/>
                {/* <Route path="/market" element={<Market/>}/> */}
                {/* <Route path="/neural-network" element={<NeuralNetwork/>}/> */}
                <Route path="/settings" element={<Settings/>}/>
                {/* <Route path="/strategies" element={<Strategies/>}/> */}
                {/* <Route path="/server-monitoring" element={<ServerMonitoring/>}/> */}
                {/* <Route path="/trading-hours" element={<TradingHours/>}/> */}
                <Route path="/metrics-monitoring" element={<MetricsMonitoring/>}/>
                <Route path="/performance" element={<Performance/>}/>
                <Route path="*" element={<>Нет роута</>}/>
            </Routes>

        </>
    );
};

export default AppRouter;
