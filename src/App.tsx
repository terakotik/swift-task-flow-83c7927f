import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "./pages/Landing";
import AdminAuth from "./pages/AdminAuth";
import UserAuth from "./pages/UserAuth";
import SuperAdmin from "./pages/SuperAdmin";
import NotFound from "./pages/NotFound";
import ReelsLanding from "./pages/ReelsLanding";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/adminus" element={<AdminAuth />} />
          <Route path="/uzero" element={<UserAuth />} />
          <Route path="/superadmin" element={<SuperAdmin />} />
          <Route path="/reels" element={<ReelsLanding />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
