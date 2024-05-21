import { Inject, Injectable } from '@nestjs/common';

import { v4 } from 'uuid';

import { Client } from 'pg';
import { Cart } from '../models';

@Injectable()
export class CartService {
  constructor(@Inject('DATABASE_CONNECTION') private client: Client) {}

  async findByUserId(userId: string): Promise<Cart> {
    const queryResult = await this.client.query(
      `SELECT carts.id,
        COALESCE(ARRAY_AGG(json_build_object('product_id', cart_items.product_id, 'count', cart_items.count)) FILTER (WHERE cart_items.cart_id IS NOT NULL), ARRAY[]::json[]) AS items
        FROM carts
        LEFT JOIN cart_items ON carts.id = cart_items.cart_id
        WHERE carts.user_id = $1
        GROUP BY carts.id;`,
      [userId],
    );

    return queryResult.rows[0];
  }

  async createByUserId(userId: string): Promise<Cart> {
    const id = v4();
    const date = new Date();

    await this.client.query(
      `INSERT INTO carts (id, user_id, created_at, updated_at, status) VALUES ($1, $2, $3, $4, $5);`,
      [id, userId, date.toISOString(), date.toISOString(), 'OPEN'],
    );

    return await this.findByUserId(userId);
  }

  async findOrCreateByUserId(userId: string): Promise<Cart> {
    const cart = await this.findByUserId(userId);

    console.log('cart', cart);
    if (!cart) {
      return await this.createByUserId(userId);
    }

    return cart;
  }

  async updateByUserId(
    userId: string,
    cartItem: { product_id: string; count: number },
  ): Promise<Cart> {
    await this.client.query('BEGIN');

    const res = await this.client.query(
      'SELECT id FROM carts WHERE user_id = $1',
      [userId],
    );

    if (res.rows.length > 0) {
      const cartId = res.rows[0].id;

      const { product_id, count } = cartItem;

      await this.client.query(
        'UPDATE cart_items SET product_id = $1, count = $2 WHERE cart_id = $3',
        [product_id, count, cartId],
      );

      // Commit transaction
      await this.client.query('COMMIT');
    } else {
      await this.client.query('ROLLBACK');
      throw new Error('Invalid user_id');
    }

    return this.findByUserId(userId);
  }

  async removeByUserId(userId: string): Promise<void> {
    await this.client.query('DELETE FROM carts WHERE user_id = $1', [userId]);
  }
}
