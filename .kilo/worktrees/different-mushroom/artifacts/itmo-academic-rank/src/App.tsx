import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/landing";
import Auth from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Apply from "@/pages/apply";
import Applications from "@/pages/applications";
import ApplicationDetail from "@/pages/application-detail";
import Chat from "@/pages/chat";
import ExpertPanel from "@/pages/expert";
import AdminDashboard from "@/pages/admin";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Auth} />
      <Route path="/register" component={Auth} />
      
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/apply" component={Apply} />
      <Route path="/applications" component={Applications} />
      <Route path="/applications/:id" component={ApplicationDetail} />
      <Route path="/chat" component={Chat} />
      
      <Route path="/expert" component={ExpertPanel} />
      <Route path="/admin" component={AdminDashboard} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
