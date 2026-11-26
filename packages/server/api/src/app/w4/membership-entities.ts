import { ProjectRole } from '@activepieces/core-utils'
import { Project, ProjectMember } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../database/database-common'
import { UserSchema } from '../user/user-entity'

export const W4ProjectRoleEntity = new EntitySchema<ProjectRole>({
    name: 'project_role',
    columns: {
        ...BaseColumnSchemaPart,
        name: { type: String },
        permissions: { type: 'jsonb' },
        platformId: { ...ApIdSchema, nullable: true },
        type: { type: String },
    },
    indices: [{ name: 'w4_role_platform_name', columns: ['platformId', 'name'], unique: true }],
})

export const W4ProjectMemberEntity = new EntitySchema<MemberRecord>({
    name: 'project_member',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: ApIdSchema,
        projectId: ApIdSchema,
        userId: ApIdSchema,
        projectRoleId: ApIdSchema,
    },
    indices: [{ name: 'w4_member_project_user', columns: ['projectId', 'userId'], unique: true }],
    relations: {
        user: { type: 'many-to-one', target: 'user', joinColumn: { name: 'userId' }, onDelete: 'CASCADE' },
        project: { type: 'many-to-one', target: 'project', joinColumn: { name: 'projectId' }, onDelete: 'CASCADE' },
        projectRole: { type: 'many-to-one', target: 'project_role', joinColumn: { name: 'projectRoleId' }, onDelete: 'RESTRICT' },
    },
})

export type MemberRecord = ProjectMember & { user: UserSchema, project: Project, projectRole: ProjectRole }
