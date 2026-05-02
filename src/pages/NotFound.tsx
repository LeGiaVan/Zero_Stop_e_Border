import { Link, useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="text-center max-w-md">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Error 404</p>
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground">Page not found</h1>
        <p className="mb-6 text-muted-foreground text-sm leading-relaxed">
          The page{" "}
          <span className="font-mono text-xs bg-background px-1.5 py-0.5 rounded border border-border/60">
            {location.pathname}
          </span>{" "}
          does not exist or has been moved.
        </p>
        <Link to="/" className="inline-flex text-sm font-medium text-primary hover:underline">
          Return to home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
