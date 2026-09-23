import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    // Show a failed read once, after the retry. Backend errors are not transient, so one
    // retry is enough (the default of 3 made a failing screen wait and toast four times).
    queryCache: new QueryCache({ onError: (error) => toast.error(error.message) }),
    defaultOptions: { queries: { retry: 1 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
