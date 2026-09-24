import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { ApiError, SESSION_INVALID } from "./lib/api";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    // Show a failed read once, after the retry. Backend errors are not transient, so one
    // retry is enough (the default of 3 made a failing screen wait and toast four times), and
    // an expired session is never retried. The toast id collapses identical messages, such as
    // several screens learning at once that the session expired.
    queryCache: new QueryCache({
      onError: (error) => toast.error(error.message, { id: error.message }),
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          failureCount < 1 && !(error instanceof ApiError && error.code === SESSION_INVALID),
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
