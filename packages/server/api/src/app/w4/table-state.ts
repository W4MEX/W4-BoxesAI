import { PopulatedTable, TableState } from '@activepieces/shared'

export function w4TableState(table: PopulatedTable): TableState {
    return TableState.parse({
        id: table.id,
        name: table.name,
        externalId: table.externalId,
        status: table.status,
        trigger: table.trigger,
        fields: table.fields.map(field => ({
            name: field.name,
            type: field.type,
            externalId: field.externalId,
            data: 'data' in field ? field.data : null,
        })),
    })
}
