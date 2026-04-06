import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import SalesDaily from "./pages/SalesDaily";
import SalesMTD from "./pages/SalesMTD";
import ProductionDaily from "./pages/ProductionDaily";
import ProductionMTD from "./pages/ProductionMTD";
import ManagerList from "./pages/ManagerList";
import DataUploads from "./pages/DataUploads";
import AlertLogs from "./pages/AlertLogs";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sales/daily" element={<SalesDaily />} />
        <Route path="/sales/mtd" element={<SalesMTD />} />
        <Route path="/production/daily" element={<ProductionDaily />} />
        <Route path="/production/mtd" element={<ProductionMTD />} />
        <Route path="/managers" element={<ManagerList />} />
        <Route path="/uploads" element={<DataUploads />} />
        <Route path="/alerts" element={<AlertLogs />} />
      </Route>
    </Routes>
  );
}
