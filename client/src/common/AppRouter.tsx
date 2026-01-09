import React, {FC} from "react";
import {Route, Routes} from "react-router-dom";
import Dashboard from '../pages/Dashboard'
import EnhancedDashboardPage from '../pages/EnhancedDashboardPage'
import NewDashboard from '../pages/NewDashboard'
import Portfolio from '../pages/Portfolio'
import Market from '../pages/Market'
import NeuralNetwork from '../pages/NeuralNetwork'
import Settings from '../pages/Settings'
import Strategies from '../pages/Strategies'
import ServerMonitoring from '../pages/ServerMonitoring'
import TradingHours from '../pages/TradingHours'
import MetricsMonitoring from '../pages/MetricsMonitoring'

const AppRouter: FC = () => {

    return (
        <>
            <Routes>
                <Route path="/" element={<NewDashboard/>}/>
                <Route path="/dashboard" element={<NewDashboard/>}/>
                <Route path="/old-dashboard" element={<Dashboard/>}/>
                <Route path="/enhanced-dashboard" element={<EnhancedDashboardPage/>}/>
                <Route path="/portfolio" element={<Portfolio/>}/>
                <Route path="/market" element={<Market/>}/>
                <Route path="/neural-network" element={<NeuralNetwork/>}/>
                <Route path="/settings" element={<Settings/>}/>
                <Route path="/strategies" element={<Strategies/>}/>
                <Route path="/server-monitoring" element={<ServerMonitoring/>}/>
                <Route path="/trading-hours" element={<TradingHours/>}/>
                <Route path="/metrics-monitoring" element={<MetricsMonitoring/>}/>
                <Route path="*" element={<>Нет роута</>}/>
            </Routes>

        </>
    );
};

export default AppRouter;
