import { CallHandler, Injectable, Scope } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, EntityManager } from 'typeorm';
import { AsyncLocalStorage } from 'async_hooks';
import { Observable } from 'rxjs';

@Injectable()
export class UnitOfWorkService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {
    this.asyncLocalStorage = new AsyncLocalStorage();
  }

  private readonly asyncLocalStorage: AsyncLocalStorage<any>;

  getManager(): EntityManager {
    const storage = this.asyncLocalStorage.getStore();
    if (storage && storage.has('typeOrmEntityManager')) {
      return this.asyncLocalStorage.getStore().get('typeOrmEntityManager');
    }
    return this.connection.createEntityManager();
  }

  async doTransactional<T>(fn): Promise<T> {
    return await this.connection.transaction(async (manager) => {
      let response: T;
      await this.asyncLocalStorage.run(new Map<string, EntityManager>(), async () => {
        this.asyncLocalStorage.getStore().set('typeOrmEntityManager', manager);
        response = await fn(manager);
      });
      return response;
    });
  }

  async doTransactionalCallHandler(fn: CallHandler): Promise<Observable<any>> {
    return await this.connection.transaction(async (manager) => {
      let response: Observable<any>;
      await this.asyncLocalStorage.run(new Map<string, EntityManager>(), async () => {
        this.asyncLocalStorage.getStore().set('typeOrmEntityManager', manager);
        response = await fn.handle().toPromise();
      });
      return response;
    });
  }
}
