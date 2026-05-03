import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

/**
 * Middleware que garantiza un `X-Request-Id` único en cada request/response.
 *
 * Comportamiento:
 *  - Si el cliente envía `X-Request-Id`, lo respeta (correlación end-to-end)
 *  - Si no, genera un UUID v4 y lo agrega al request
 *  - Siempre lo refleja en el header de respuesta para que el cliente
 *    pueda correlacionar logs en sus propias herramientas
 *
 * Esto se ejecuta antes que cualquier otro middleware/handler, garantizando
 * que `pino-http` y los exception filters siempre tengan el id disponible.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    const fromHeader = req.headers['x-request-id']
    const id =
      typeof fromHeader === 'string' && fromHeader.length > 0
        ? fromHeader
        : randomUUID()

    req.id = id
    res.setHeader('X-Request-Id', id)
    next()
  }
}
