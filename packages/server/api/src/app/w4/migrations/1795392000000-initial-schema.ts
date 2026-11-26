import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QueryRunner } from 'typeorm'
import { Migration } from '../../database/migration'

export class W4InitialSchema1795392000000 implements Migration {
    name = 'W4InitialSchema1795392000000'
    breaking = false
    release = '0.93.0'

    async up(queryRunner: QueryRunner): Promise<void> {
        const sql = await readFile(join(process.cwd(), 'deploy/w4/schema-initial.sql'), 'utf8')
        await queryRunner.query(sql)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        const sql = await readFile(join(process.cwd(), 'deploy/w4/schema-initial-down.sql'), 'utf8')
        await queryRunner.query(sql)
    }
}
