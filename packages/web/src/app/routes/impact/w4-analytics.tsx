import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DataFetchErrorState } from '@/components/custom/data-fetch-error-state';
import { PageHeader } from '@/components/custom/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { projectCollectionUtils } from '@/features/projects';
import { useIsPlatformAdmin } from '@/hooks/authorization-hooks';
import { platformHooks } from '@/hooks/platform-hooks';
import { api } from '@/lib/api';

type Analytics = {
  organizationId: string;
  projectId: string | null;
  from: string;
  until: string;
  projects: number;
  activeUsers: number;
  flows: number;
  enabledFlows: number;
  averageDurationMs: number | null;
  runs: {
    total: number;
    succeeded: number;
    failed: number;
    successRate: number | null;
  };
  dailyRuns: { date: string; count: number }[];
};

export default function W4Analytics() {
  const { platform } = platformHooks.useCurrentPlatform();
  const isAdmin = useIsPlatformAdmin();
  const { data: projects } = projectCollectionUtils.useAll();
  const [days, setDays] = useState('30');
  const [projectId, setProjectId] = useState('all');
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['w4-analytics', platform.id, projectId, days],
    queryFn: () =>
      api.get<Analytics>('/v1/w4/analytics', {
        days: Number(days),
        ...(projectId === 'all' ? {} : { projectId }),
      }),
    enabled: isAdmin,
  });
  if (!isAdmin)
    return (
      <p className="p-6">
        {t('W4 analytics requires an organization administrator.')}
      </p>
    );
  const metrics = data
    ? [
        { label: t('Projects'), value: data.projects },
        { label: t('W4 active organization users'), value: data.activeUsers },
        { label: t('Flows'), value: data.flows },
        { label: t('Active flows'), value: data.enabledFlows },
        { label: t('W4 production runs'), value: data.runs.total },
        { label: t('Successful runs'), value: data.runs.succeeded },
        { label: t('Failed runs'), value: data.runs.failed },
        {
          label: t('Success rate'),
          value:
            data.runs.successRate === null
              ? '—'
              : `${(data.runs.successRate * 100).toFixed(1)}%`,
        },
      ]
    : [];
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title={t('W4 Analytics')}
        rightContent={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger aria-label={t('Project')} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('All projects')}</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger aria-label={t('Time period')} className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('Last 7 days')}</SelectItem>
                <SelectItem value="30">{t('Last 30 days')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {t('Refresh')}
            </Button>
          </div>
        }
      />
      <div className="flex flex-col gap-6 px-6 pb-6">
        {isPending && <p role="status">{t('Loading analytics...')}</p>}
        {isError && (
          <DataFetchErrorState
            entity={t('W4 Analytics')}
            onRetry={() => void refetch()}
          />
        )}
        {!isError && data && (
          <>
            <p className="text-sm text-gray-11">{t('W4 analytics scope')}</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <Card key={metric.label}>
                  <CardHeader>
                    <CardTitle className="text-sm">{metric.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold tabular-nums">
                    {metric.value}
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t('W4 daily production runs')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.dailyRuns.length === 0 ? (
                  <p className="py-10 text-gray-11">
                    {t('W4 no production runs in this period.')}
                  </p>
                ) : (
                  <>
                    <div
                      className="h-64"
                      role="img"
                      aria-label={t('W4 daily production runs')}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.dailyRuns}>
                          <CartesianGrid
                            stroke="var(--gray-6)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: 'var(--gray-11)' }}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fill: 'var(--gray-11)' }}
                          />
                          <Tooltip />
                          <Bar
                            dataKey="count"
                            name={t('Runs')}
                            fill="var(--accent-9)"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <details className="mt-4 text-sm">
                      <summary>{t('View data')}</summary>
                      <table className="mt-2 w-full">
                        <thead>
                          <tr>
                            <th scope="col">{t('Date')}</th>
                            <th scope="col">{t('Runs')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.dailyRuns.map((row) => (
                            <tr key={row.date}>
                              <td>{row.date}</td>
                              <td className="text-center">{row.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </>
                )}
                <p className="mt-4 text-sm text-gray-11">
                  {t('W4 average completed run duration')}:{' '}
                  {data.averageDurationMs === null
                    ? '—'
                    : `${(data.averageDurationMs / 1000).toFixed(2)} s`}
                </p>
                <p className="mt-2 text-xs text-gray-11">
                  {new Date(data.from).toLocaleString()} —{' '}
                  {new Date(data.until).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
