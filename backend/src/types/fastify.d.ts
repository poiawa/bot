import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    adminOnly: (request: any, reply: any) => Promise<void>;
  }
}
