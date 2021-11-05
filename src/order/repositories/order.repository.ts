import { HttpException, Injectable } from '@nestjs/common';
import { Order } from '../models/order.model';
import { UnitOfWorkService } from '../../core/services/unit-of-work.service';
import { Item } from '../models/item.model';

@Injectable()
export class OrderRepository {
  constructor(private readonly uow: UnitOfWorkService) {
    console.log('###### OrderRepository loaded'); // just to check if repository is loaded multiple times because of some dependency
  }

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

    // throw execmption randomly, allowing us to check the consistency during successful or error operation
    const rand = Math.floor(Math.random() * 5);
    if (rand <= 2) {
      throw new HttpException("xablau", 500);
    }

    return this.uow.getManager().save(item);
  }
}
