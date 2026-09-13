interface EventContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: EventContext): Promise<Response> {
  const url = new URL(context.request.url);

  // Redirect the default production pages.dev subdomain to the primary custom domain.
  // Preview deployments (e.g. <hash>.binsight.pages.dev) and the custom domain itself are untouched.
  if (url.hostname === "binsight.pages.dev") {
    url.hostname = "binsight.adrijshikhar.dev";
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
