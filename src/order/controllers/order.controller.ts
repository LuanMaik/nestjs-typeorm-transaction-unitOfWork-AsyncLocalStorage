import { Body, Controller, Get, Param, Post, UseInterceptors } from '@nestjs/common';
import { OrderService } from '../services/order.service';
import { Order } from '../models/order.model';
import { CreateOrderRequestDto } from '../dto/create-order-request.dto';
import { UnitOfWorkService } from '../../core/services/unit-of-work.service';
import { TransactionStorageInterceptor } from '../../core/interceptors/transaction-storage.interceptor';

@Controller('/v1/order')
export class OrderController {
  constructor(
    private readonly unitOfWork: UnitOfWorkService,
    private readonly orderService: OrderService,
  ) {
    console.log('###### Controller loaded'); // just to check if controller is loaded multiple times because of some dependency
  }

  @Get()
  async all(): Promise<Order[]> {
    return this.orderService.getAll();
  }

  @Get()
  async getById(@Param('id') id: number): Promise<Order> {
    return this.orderService.getById(id);
  }

  @Post('firstWay')
  async createFirstWay(@Body() orderDto: CreateOrderRequestDto) {
    return this.unitOfWork.doTransactional(async (): Promise<Order> => {
      return this.orderService.createOrder(orderDto);
    });
  }

  @Post('secondWay')
  @UseInterceptors(TransactionStorageInterceptor)
  async createSecondWay(@Body() orderDto: CreateOrderRequestDto) {
    return this.orderService.createOrder(orderDto);
  }
}
