export async function onRequestError(
  err: any,
  request: {
    path: string;
    method: string;
    headers: any;
  },
  context: {
    routerKind: 'Pages' | 'App';
    routeType: 'render' | 'action';
  }
) {
  const timestamp = new Date().toISOString();
  console.error(`[SERVER_EXCEPTION] [${timestamp}]
Route: ${request.path}
Method: ${request.method}
Route Type: ${context.routeType}
Router Kind: ${context.routerKind}
Error Message: ${err.message}
Stack Trace: ${err.stack || "No stack trace available."}
`);
}
