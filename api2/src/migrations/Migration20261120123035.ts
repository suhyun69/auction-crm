import { Migration } from '@mikro-orm/migrations';

export class Migration20261120123035 extends Migration {
  override name = 'Migration20261120123035';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "auction" ("id" bigint not null, "highest_amount" bigint null, "highest_bidder_name" varchar(100) null, primary key ("id"));`,
    );

    this.addSql(
      `create table "auction_participant" ("id" bigserial primary key, "auction_id" bigint not null, "customer_name" varchar(100) not null, "created_at" timestamptz not null);`,
    );
    this.addSql(
      `create index "ix_participant_created" on "auction_participant" ("created_at", "id");`,
    );
    this.addSql(
      `alter table "auction_participant" add constraint "uk_participant_auction_name" unique ("auction_id", "customer_name");`,
    );

    this.addSql(
      `create table "auction_bid" ("id" bigserial primary key, "participant_id" bigint not null, "amount" bigint not null, "status" text not null, "reason" text not null, "highest_amount" bigint not null, "highest_bidder_name" varchar(100) not null, "created_at" timestamptz not null, "idempotency_key" varchar(200) null);`,
    );
    this.addSql(
      `alter table "auction_bid" add constraint "uk_bid_idempotency_key" unique ("idempotency_key");`,
    );
    this.addSql(
      `create index "ix_bid_participant_status" on "auction_bid" ("participant_id", "status", "amount");`,
    );
    this.addSql(
      `create index "ix_bid_created" on "auction_bid" ("created_at", "id");`,
    );
    this.addSql(
      `alter table "auction_bid" add constraint "auction_bid_status_check" check ("status" in ('ACCEPTED', 'REJECTED'));`,
    );
    this.addSql(
      `alter table "auction_bid" add constraint "auction_bid_reason_check" check ("reason" in ('NEW_HIGHEST_BID', 'AMOUNT_NOT_HIGH_ENOUGH'));`,
    );

    this.addSql(
      `alter table "auction_participant" add constraint "auction_participant_auction_id_foreign" foreign key ("auction_id") references "auction" ("id");`,
    );

    this.addSql(
      `alter table "auction_bid" add constraint "auction_bid_participant_id_foreign" foreign key ("participant_id") references "auction_participant" ("id");`,
    );
  }
}
