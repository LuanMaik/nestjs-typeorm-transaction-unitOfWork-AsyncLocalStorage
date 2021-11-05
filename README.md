
# NestJs - Database transaction using TypeORM, Unit Of Work and AsyncLocalStorage

This repository shows how to implement unit of work pattern in NestJs Framework to realize transactional work with TypeORM using AsyncLocalStorage.

This implementation is an improvement of [NestJs - Unit Of Work](https://github.com/LuanMaik/nestjs-unit-of-work) repository, because now the dependencies are singleton and do not cause overhead on each request.

---
## Example usage
``` typescript

@Controller('/v1/order')
export class OrderController {
  constructor(
    private readonly unitOfWork: UnitOfWorkService, //  <-- necessary only to #first way
    private readonly orderService: OrderService,
  ) {}

  @Post('firstWay')
  async createFirstWay(@Body() orderDto: CreateOrderRequestDto) {
    return this.unitOfWork.doTransactional(async (): Promise<Order> => {
      return this.orderService.createOrder(orderDto);
    });
  }

  @Post('secondWay')
  @UseInterceptors(TransactionStorageInterceptor) // <-- this intercept uses the UnitOfWorkService to wrap the transaction 
  async createSecondWay(@Body() orderDto: CreateOrderRequestDto) {
    return this.orderService.createOrder(orderDto);
  }
}

```


## Running this example

The `database.sql` file has the database structure necessary to run this example.

The configuration of database connection is set in `src/app.module.ts`.

Installing the dependencies:
```bash
  npm install
```
Running the application:

```bash
  npm run start:dev
```


Making a request using Javascript (run in your browser console and check the console application):

**ATTENTION:** to create a real case, the OrderRepository is configured to throw exception randomly
during the Order creation, allowing us to check the consistency during successful or error operation.
```js
var myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");

var raw = JSON.stringify({
  "date":"2021-11-03",
  "description":"Testing transaction",
  "items":[
    { "name": "T-Shirt", "quantity": 1 }
  ]
});

var requestOptions = {
  method: 'POST',
  headers: myHeaders,
  body: raw,
  redirect: 'follow'
};

fetch("http://localhost:3000/v1/order/secondWay", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));
```




## The problem in NestJs with TypeORM

NestJs it's an amazing frameworks to NodeJs, with a powerful Dependency Injection Service, BUT when we need to work with TypeORM Repositories in transaction operation, the beautiful of repository injection fade away.

See below some issues about it:

- [ISSUE: Better transaction management](https://github.com/nestjs/typeorm/issues/584)
- [ISSUE: Transaction management in service layer](https://github.com/nestjs/nest/issues/2609)
- [ISSUE: support Distributed Transaction Service , like spring JTA](https://github.com/nestjs/nest/issues/1220)
- [ISSUE: Transactions in NestJs](https://github.com/nestjs/typeorm/issues/57)
- [ISSUE: Transactions support](https://github.com/nestjs/typeorm/issues/108)


## Other approaches

There are other repositories/libs that try to resolve the same problem:

- [ypeorm-transactional-cls-hooked](https://github.com/odavid/typeorm-transactional-cls-hooked)
- [nest_transact](https://github.com/alphamikle/nest_transact)


## How it works

My implementation uses a service class called UnitOfWorkService to share the same connection between the custom repositories using AsyncLocalStorage.

```typescript
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

  // Used manually
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

  // Used by Interceptors
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
```

## How to create a custom repository
My approach **doesn't** work with default TypeORM repositories provided by injection, you need to implement your own repository or generate it from TypeORM EntityManager shared.


```typescript
import { Injectable } from '@nestjs/common';
import { Order } from '../models/order.model';
import { UnitOfWorkService } from '../../core/services/unit-of-work.service';
import { Item } from '../models/item.model';

@Injectable()
export class OrderRepository {
  constructor(private readonly uow: UnitOfWorkService) {} // <-- receive the UnitOfWorkService with the manager

  async getAll(): Promise<Order[]> {
    return this.uow.getManager().find(Order, {
      relations: ['items'],
    });
  }

  async getById(idOrder: number): Promise<Order> {
    return this.uow.getManager().findOneOrFail(Order, idOrder, {
      relations: ['items'],
    });
  }

  async saveOrder(order: Order): Promise<Order> {
    return this.uow.getManager().save(order);
  }

  async saveOrderItem(item: Item): Promise<Item> {
    return this.uow.getManager().save(item);
  }
}
```

## Creating a service
The entity service must only receive the custom repository by injection:

```typescript
import { Injectable } from '@nestjs/common';
import { OrderRepository } from '../repositories/order.repository';
import { CreateOrderRequestDto } from '../dto/create-order-request.dto';
import { Order } from '../models/order.model';
import { Item } from '../models/item.model';

@Injectable()
export class OrderService {
  constructor(private readonly orderRepository: OrderRepository) {} // <-- the custom repo created before

  async getAll(): Promise<Order[]> {
    return this.orderRepository.getAll();
  }

  async getById(id: number): Promise<Order> {
    return this.orderRepository.getById(id);
  }

  async createOrder(orderDto: CreateOrderRequestDto): Promise<Order> {
    const order = new Order();
    order.date = orderDto.date;
    order.description = orderDto.description;

    await this.orderRepository.saveOrder(order);

    for (const itemDto of orderDto.items) {
      const item = new Item();
      item.name = itemDto.name;
      item.quantity = itemDto.quantity;
      item.order = order;
      await this.orderRepository.saveOrderItem(item);
    }

    return order;
  }
}
```



## Create a transactional operation in controller
The controller needs only receive the UnitOfWorkService by injection:

```typescript
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { OrderService } from '../services/order.service';
import { Order } from '../models/order.model';
import { CreateOrderRequestDto } from '../dto/create-order-request.dto';
import { UnitOfWorkService } from '../../core/services/unit-of-work.service';

@Controller('/v1/order')
export class OrderController {
  constructor(
    private readonly unitOfWork: UnitOfWorkService,
    private readonly orderService: OrderService,
  ) {}

  @Get()
  async all(): Promise<Order[]> {
    return this.orderService.getAll(); // <-- use the service with the default (non-transactional) manager
  }

  @Get()
  async getById(@Param('id') id: number): Promise<Order> {
    return this.orderService.getById(id); // <-- use the service with the default (non-transactional) manager
  }

  @Post('firstWay')
  async createFirstWay(@Body() orderDto: CreateOrderRequestDto) {
    return this.unitOfWork.doTransactional(async (): Promise<Order> => {
      return this.orderService.createOrder(orderDto);
    });
  }

  @Post('secondWay')
  @UseInterceptors(TransactionStorageInterceptor) // <-- this intercept uses the UnitOfWorkService to wrap the transaction 
  async createSecondWay(@Body() orderDto: CreateOrderRequestDto) {
    return this.orderService.createOrder(orderDto);
  }
}
```


## Contributing

Contributions are always welcome!

I will be glad to know if this approach help you or if you know a better way to resolve the same problem.

