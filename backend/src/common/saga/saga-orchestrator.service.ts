import { Injectable, Logger } from "@nestjs/common";

/**
 * SagaOrchestratorService — patrón Saga para transacciones distribuidas.
 *
 * Cuando un flujo cruza múltiples servicios o agrega operaciones que NO
 * pueden envolverse en una transacción de DB (porque incluyen llamadas
 * a sistemas externos: PSE, blockchain, email), necesitamos
 * compensaciones explícitas si un paso intermedio falla.
 *
 * Ejemplo concreto: book → pay → notify
 *  1. Crear Appointment (DB)
 *  2. Procesar pago en pasarela (externo)
 *  3. Enviar notificación email + push
 *
 * Si paso 3 falla, NO podemos rollback paso 2 (el cliente ya pagó).
 * Pero si paso 2 falla, SÍ debemos cancelar la cita creada en paso 1.
 *
 * Esta clase ofrece:
 *  - API tipada para definir steps con su acción y compensación
 *  - Ejecución secuencial con captura de estado intermedio
 *  - Si un paso falla → ejecuta compensaciones de los pasos anteriores
 *    en orden inverso (LIFO), atrapando errores para no enmascarar el original.
 *  - Logging estructurado para observability.
 */

interface SagaStep<TIn, TOut> {
  name: string;
  /** La operación principal del paso. Recibe el input acumulado, retorna su output. */
  action: (input: TIn) => Promise<TOut>;
  /**
   * Compensación que revierte el efecto de `action` si un paso posterior falla.
   * Recibe el output del propio paso (lo que produjo) más el input acumulado.
   * Debe ser idempotente: puede llamarse múltiples veces.
   */
  compensate?: (output: TOut, input: TIn) => Promise<void>;
  /** Si true, una falla del paso NO dispara compensaciones (best-effort) */
  optional?: boolean;
}

interface SagaResult<T> {
  success: boolean;
  result?: T;
  failedStep?: string;
  error?: Error;
  /** Pasos completados antes de la falla (en orden) */
  completedSteps: string[];
  /** Compensaciones que se ejecutaron tras la falla */
  compensatedSteps: string[];
  /** Compensaciones que también fallaron (orphans peligrosos) */
  orphans: Array<{ step: string; error: string }>;
}

@Injectable()
export class SagaOrchestratorService {
  private readonly logger = new Logger(SagaOrchestratorService.name);

  /**
   * Ejecuta una saga. Los outputs de cada paso se acumulan en un objeto que
   * se pasa al siguiente paso, permitiendo composición.
   */
  async run<TFinal extends Record<string, unknown> = Record<string, unknown>>(
    sagaName: string,
    steps: Array<SagaStep<any, any>>,
    initialContext: Record<string, unknown> = {},
  ): Promise<SagaResult<TFinal>> {
    const completedSteps: string[] = [];
    const completedOutputs: Array<{ step: SagaStep<any, any>; output: any }> =
      [];
    let context: Record<string, unknown> = { ...initialContext };

    for (const step of steps) {
      const stepStart = Date.now();
      try {
        this.logger.debug(`[saga:${sagaName}] → ${step.name}`);
        const output = await step.action(context);

        // Acumular output bajo la key del paso (si retornó algo asignable)
        if (output && typeof output === "object") {
          context = { ...context, ...output };
        } else {
          context[step.name] = output;
        }

        completedSteps.push(step.name);
        completedOutputs.push({ step, output });

        const ms = Date.now() - stepStart;
        this.logger.log(`[saga:${sagaName}] ✓ ${step.name} (${ms}ms)`);
      } catch (err) {
        const ms = Date.now() - stepStart;
        const error = err as Error;
        this.logger.error(
          `[saga:${sagaName}] ✗ ${step.name} (${ms}ms): ${error.message}`,
        );

        // Si el paso es optional, continuamos sin compensar
        if (step.optional) {
          this.logger.warn(
            `[saga:${sagaName}] step ${step.name} marcado optional, continuando`,
          );
          continue;
        }

        // Compensar pasos anteriores en orden inverso
        const compensation = await this.compensate(
          sagaName,
          completedOutputs,
          context,
        );

        return {
          success: false,
          failedStep: step.name,
          error,
          completedSteps,
          compensatedSteps: compensation.compensated,
          orphans: compensation.orphans,
        };
      }
    }

    return {
      success: true,
      result: context as TFinal,
      completedSteps,
      compensatedSteps: [],
      orphans: [],
    };
  }

  /**
   * Ejecuta las compensaciones en orden inverso, atrapando errores
   * de compensación para no enmascarar el error original que disparó la saga.
   */
  private async compensate(
    sagaName: string,
    completed: Array<{ step: SagaStep<any, any>; output: any }>,
    context: Record<string, unknown>,
  ): Promise<{
    compensated: string[];
    orphans: Array<{ step: string; error: string }>;
  }> {
    const compensated: string[] = [];
    const orphans: Array<{ step: string; error: string }> = [];

    // LIFO: el último paso completado se compensa primero
    for (const { step, output } of [...completed].reverse()) {
      if (!step.compensate) continue;

      try {
        this.logger.warn(`[saga:${sagaName}] compensating ${step.name}`);
        await step.compensate(output, context);
        compensated.push(step.name);
      } catch (err) {
        const error = err as Error;
        // Critical: una compensación falló. Esto deja un "orphan" en el sistema.
        // Loggear con CRITICAL para alertar a humanos.
        this.logger.error(
          `[saga:${sagaName}] COMPENSATION FAILED for ${step.name}: ${error.message}. ` +
            `Manual intervention required.`,
        );
        orphans.push({ step: step.name, error: error.message });
      }
    }

    return { compensated, orphans };
  }
}
