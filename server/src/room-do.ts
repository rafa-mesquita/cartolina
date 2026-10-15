import { DurableObject } from 'cloudflare:workers';

export class RoomDO extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return new Response('not_found', { status: 404 });
  }
}
