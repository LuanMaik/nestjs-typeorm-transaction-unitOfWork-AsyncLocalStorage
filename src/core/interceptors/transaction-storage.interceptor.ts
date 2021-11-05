import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from 'rxjs';
import { UnitOfWorkService } from '../services/unit-of-work.service';


@Injectable()
export class TransactionStorageInterceptor implements NestInterceptor {
  constructor(
    private uow: UnitOfWorkService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    return this.uow.doTransactionalCallHandler(next);
  }
}
