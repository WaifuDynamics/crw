import { clay } from '../claySurface';
import { tint } from '../theme';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useData, useAction, useSession, post, request, invalidate, uid, money } from '../api';
import {
  C,
  S,
  T,
  Heading,
  Label,
  Icon,
  Tap,
  Button,
  Chip,
  Chips,
  Page,
  QueryState,
  Header,
  Field,
  SectionTitle,
  Toggle,
} from '../ui';
import { EmailPanel, FoodPanel, MembersPanel, TeamPanel } from './adminPanels';

// Sections that are not a database table of their own: each one has its own panel below.
const panels: Record<string, React.ComponentType> = {
  food: FoodPanel,
  members: MembersPanel,
  team: TeamPanel,
  email: EmailPanel,
};
const resources = [
  'food',
  'members',
  'team',
  'email',
  'applications',
  'users',
  'communities',
  'events',
  'bookings',
  'payments',
  'refunds',
  'payouts',
  'fees',
  'challenges',
  'achievements',
  'seasons',
  'xp',
  'xp_rules',
  'reports',
  'categories',
  'countries',
  'currencies',
  'cities',
  'notifications',
  'audit',
];
const configurable = [
  'fees',
  'challenges',
  'achievements',
  'seasons',
  'xp_rules',
  'categories',
  'countries',
  'currencies',
  'cities',
];
const templates: Record<string, any> = {
  fees: { country_code: 'LB', currency: 'USD', fixed_minor: 50, basis_points: 500, enabled: true },
  categories: { slug: '', name: '', enabled: true },
  countries: { code: '', name: '', timezone: 'UTC', enabled: false },
  currencies: { code: '', minor_digits: 2 },
  cities: { country_code: 'LB', name: '', latitude: 0, longitude: 0, timezone: 'Asia/Beirut' },
  challenges: {
    title: '',
    description: '',
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    kind: 'attendance',
    category: null,
    target: 4,
    reward_xp: 300,
    badge: 'flash',
    enabled: true,
  },
  achievements: {
    slug: '',
    title: '',
    description: '',
    kind: 'attendance',
    threshold: 10,
    badge: 'medal',
    enabled: true,
  },
  seasons: {
    name: '',
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 90 * 86400000).toISOString(),
  },
  xp_rules: { source: 'attendance', points: 100, enabled: true },
};
export default function AdminScreen({ navigation }: any) {
  const overview = useData('/admin/overview');
  const [resource, setResource] = useState('applications'),
    [offset, setOffset] = useState(0),
    [editor, setEditor] = useState<any>(null),
    [action, setAction] = useState<any>(null),
    [note, setNote] = useState('');
  const Panel = panels[resource];
  const q = useData(`/admin/data/${resource}?offset=${offset}`, !Panel);
  const { busy, run } = useAction();
  const { say } = useSession();
  const execute = (path: string, body: any, description: string, method = 'POST') => {
    setAction({ path, body, description, method });
    setNote('');
  };
  const edit = (row: any) => {
    const fields = templates[resource];
    const entry: any = {};
    if (!['categories', 'countries', 'currencies', 'xp_rules'].includes(resource))
      entry.id = row?.id || uid();
    for (const key of Object.keys(fields)) entry[key] = row?.[key] ?? fields[key];
    setEditor(entry);
  };
  const save = () =>
    run(async () => {
      await request(`/admin/config/${resource}`, { method: 'PUT', body: JSON.stringify(editor) });
      setEditor(null);
      await invalidate();
      say('Configuration saved and audited.');
    });
  return (
    <View style={S.page}>
      <Header title="CRW+ / PLATFORM" onBack={navigation.goBack} />
      <Page pad={false}>
        <View style={[S.pad, { marginTop: 18 }]}>
          <Label style={{ color: C.blue }}>PLATFORM OPERATIONS</Label>
          <Heading style={{ fontSize: 44, marginTop: 9 }}>KEEP THE GOOD MOVING.</Heading>
          <View style={[S.row, { gap: 10, flexWrap: 'wrap', marginTop: 20, marginBottom: 23 }]}>
            {[
              ['users', 'People'],
              ['organizers', 'Organizers'],
              ['bookings', 'Bookings'],
              ['reports', 'Open reports'],
            ].map(([key, label]) => (
              <View
                key={key}
                style={{ width: '47%', padding: 18, ...clay('graphite', 0.7), borderRadius: 14 }}
              >
                <Heading style={{ fontSize: 36, color: C.blue }}>
                  {overview.data?.[key] ?? '—'}
                </Heading>
                <T style={{ fontSize: 10 }}>{label}</T>
              </View>
            ))}
          </View>
          {overview.data?.revenue.map((r: any) => (
            <View key={r.currency} style={[S.card, { marginBottom: 22 }]}>
              <Label>{r.currency} · CONFIRMED REVENUE</Label>
              <Heading style={{ fontSize: 34, marginTop: 10 }}>
                {money(Number(r.fees), r.currency)} <T style={{ fontSize: 11 }}>platform fees</T>
              </Heading>
              <T style={{ fontSize: 11 }}>
                {money(Number(r.gross), r.currency)} gross ·{' '}
                {money(Number(r.organizer_earnings), r.currency)} organizer earnings
              </T>
            </View>
          ))}
        </View>
        <Chips>
          {resources.map((r) => (
            <Chip
              key={r}
              title={r.replace('_', ' ')}
              active={resource === r}
              onPress={() => {
                setResource(r);
                setOffset(0);
                setEditor(null);
                setAction(null);
              }}
            />
          ))}
        </Chips>
        {Panel ? (
          <View style={[S.pad, { paddingBottom: 40 }]}>
            <Panel />
          </View>
        ) : (
          <View style={[S.pad, { marginTop: 22 }]}>
            <View style={S.between}>
              <Heading style={{ fontSize: 29 }}>{resource.replace('_', ' ').toUpperCase()}</Heading>
              {configurable.includes(resource) && (
                <Button
                  title="Add new"
                  variant="white"
                  onPress={() => edit(null)}
                  style={{ minHeight: 41 }}
                />
              )}
            </View>
            {editor && (
              <View style={[S.card, { marginTop: 20 }]}>
                <SectionTitle title="EDIT CONFIGURATION" />
                {Object.entries(editor).map(([key, value]) =>
                  typeof value === 'boolean' ? (
                    <Toggle
                      key={key}
                      title={key.replaceAll('_', ' ')}
                      value={value}
                      onChange={(v: boolean) => setEditor({ ...editor, [key]: v })}
                    />
                  ) : (
                    <Field
                      key={key}
                      label={key.replaceAll('_', ' ')}
                      value={value === null ? '' : String(value)}
                      onChange={(v: string) =>
                        setEditor({
                          ...editor,
                          [key]:
                            typeof templates[resource]?.[key] === 'number'
                              ? Number(v)
                              : key === 'category' && !v
                                ? null
                                : v,
                        })
                      }
                      multiline={['description'].includes(key)}
                    />
                  ),
                )}
                <Button title="Save configuration" loading={busy} onPress={save} />
                <Button
                  title="Close editor"
                  variant="outline"
                  onPress={() => setEditor(null)}
                  style={{ marginTop: 9 }}
                />
              </View>
            )}
            {action && (
              <View style={[S.card, { marginTop: 18, borderColor: C.blue, borderWidth: 1 }]}>
                <T style={{ color: C.white, marginBottom: 13 }}>{action.description}</T>
                <Field
                  label={
                    action.path.includes('record-transfer')
                      ? 'Bank or provider transfer reference'
                      : 'Review note / reason (at least 5 characters)'
                  }
                  value={note}
                  onChange={setNote}
                  multiline
                />
                <Button
                  title="Confirm action"
                  loading={busy}
                  disabled={note.trim().length < 5}
                  onPress={() =>
                    run(async () => {
                      const payload = {
                        ...action.body,
                        ...(action.path.includes('record-transfer')
                          ? { reference: note }
                          : action.path.includes('/status') || action.method === 'DELETE'
                            ? { reason: note }
                            : { note }),
                      };
                      if (action.method === 'DELETE')
                        await request(action.path, {
                          method: 'DELETE',
                          body: JSON.stringify(payload),
                        });
                      else await post(action.path, payload);
                      setAction(null);
                      await invalidate();
                      say('Action completed and audited.');
                    })
                  }
                />
                <Button
                  title="Dismiss"
                  variant="outline"
                  onPress={() => setAction(null)}
                  style={{ marginTop: 8 }}
                />
              </View>
            )}
            <QueryState query={q}>
              {q.data?.map((row: any, index: number) => (
                <View
                  key={row.id || row.code || row.slug || index}
                  style={[S.card, { marginTop: 15 }]}
                >
                  <View style={S.between}>
                    <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13, flex: 1 }}>
                      {row.name ||
                        row.title ||
                        row.email ||
                        row.action ||
                        row.source ||
                        row.slug ||
                        row.id?.slice(0, 8) ||
                        row.code}
                    </T>
                    {row.status && (
                      <Label style={{ color: C.blue, fontSize: 8 }}>
                        {row.status.replace('_', ' ').toUpperCase()}
                      </Label>
                    )}
                  </View>
                  <View style={{ marginTop: 12 }}>
                    {Object.entries(row)
                      .filter(
                        ([key, value]) =>
                          !['password_hash', 'payload', 'details', 'metadata'].includes(key) &&
                          value !== null,
                      )
                      .slice(0, 14)
                      .map(([key, value]) => (
                        <View
                          key={key}
                          style={[S.row, { alignItems: 'flex-start', gap: 10, marginBottom: 5 }]}
                        >
                          <T style={{ fontSize: 9, lineHeight: 15, width: 100 }}>
                            {key.replaceAll('_', ' ')}
                          </T>
                          <T
                            selectable
                            style={{
                              fontSize: 10,
                              lineHeight: 15,
                              color: tint('#CED2DA'),
                              flex: 1,
                            }}
                          >
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </T>
                        </View>
                      ))}
                  </View>
                  {configurable.includes(resource) && (
                    <View style={[S.row, { gap: 8, marginTop: 11 }]}>
                      <Button
                        title="Edit"
                        variant="outline"
                        onPress={() => edit(row)}
                        style={{ flex: 1, minHeight: 40 }}
                      />
                      <Button
                        title="Delete"
                        variant="outline"
                        style={{ flex: 1, minHeight: 40 }}
                        onPress={() =>
                          run(async () => {
                            await request(
                              `/admin/config/${resource}/${row.id || row.code || row.slug || row.source}`,
                              { method: 'DELETE' },
                            );
                            await invalidate();
                            say('Removed and audited.');
                          })
                        }
                      />
                    </View>
                  )}
                  {resource === 'applications' &&
                    ['submitted', 'under_review', 'suspended'].includes(row.status) && (
                      <View style={{ gap: 8, marginTop: 13 }}>
                        <Button
                          title="Approve organizer"
                          onPress={() =>
                            execute(
                              `/admin/applications/${row.id}/review`,
                              { status: 'approved' },
                              `Approve ${row.name} and grant organizer access?`,
                            )
                          }
                        />
                        <Button
                          title="Mark under review"
                          variant="outline"
                          onPress={() =>
                            execute(
                              `/admin/applications/${row.id}/review`,
                              { status: 'under_review' },
                              'Record application review',
                            )
                          }
                        />
                        <Button
                          title="Reject application"
                          variant="outline"
                          onPress={() =>
                            execute(
                              `/admin/applications/${row.id}/review`,
                              { status: 'rejected' },
                              'Record rejection and send feedback',
                            )
                          }
                        />
                      </View>
                    )}
                  {resource === 'applications' && row.status === 'approved' && (
                    <Button
                      title="Suspend organizer"
                      variant="outline"
                      onPress={() =>
                        execute(
                          `/admin/applications/${row.id}/review`,
                          { status: 'suspended' },
                          'Suspend this organizer and remove publishing access?',
                        )
                      }
                      style={{ marginTop: 12 }}
                    />
                  )}
                  {resource === 'users' && row.status !== 'deleted' && (
                    <Button
                      title="Delete account and all of its data"
                      variant="outline"
                      onPress={() =>
                        execute(
                          `/admin/users/${row.id}`,
                          {},
                          `Erase ${row.email} for good? Workouts, routes and health data go with it, and this cannot be undone.`,
                          'DELETE',
                        )
                      }
                      style={{ marginTop: 12 }}
                    />
                  )}
                  {resource === 'users' && (
                    <Button
                      title={row.status === 'active' ? 'Suspend user' : 'Restore user'}
                      variant="outline"
                      onPress={() =>
                        execute(
                          `/admin/users/${row.id}/status`,
                          { status: row.status === 'active' ? 'suspended' : 'active' },
                          'Update account access',
                        )
                      }
                      style={{ marginTop: 12 }}
                    />
                  )}
                  {resource === 'events' && (
                    <View style={{ gap: 8, marginTop: 12 }}>
                      <Button
                        title="Manage activity & bookings"
                        variant="white"
                        onPress={() => navigation.navigate('ManageEvent', { event: row })}
                      />
                      <Button
                        title={row.featured ? 'Remove feature' : 'Feature activity'}
                        variant="outline"
                        onPress={() =>
                          run(async () => {
                            await post(`/admin/events/${row.id}/feature`, {
                              featured: !row.featured,
                            });
                            await invalidate();
                          })
                        }
                      />
                    </View>
                  )}
                  {resource === 'bookings' && ['reserved', 'confirmed'].includes(row.status) && (
                    <Button
                      title="Cancel & refund booking"
                      variant="outline"
                      onPress={() =>
                        run(async () => {
                          await post(`/organizer/bookings/${row.id}/refund`);
                          await invalidate();
                        })
                      }
                      style={{ marginTop: 12 }}
                    />
                  )}
                  {resource === 'reports' && row.status === 'open' && (
                    <View style={{ gap: 8, marginTop: 12 }}>
                      <Button
                        title="Resolve report"
                        onPress={() =>
                          execute(
                            `/admin/reports/${row.id}/resolve`,
                            { status: 'resolved' },
                            'Record moderation resolution',
                          )
                        }
                      />
                      <Button
                        title="Dismiss report"
                        variant="outline"
                        onPress={() =>
                          execute(
                            `/admin/reports/${row.id}/resolve`,
                            { status: 'dismissed' },
                            'Record reason for dismissal',
                          )
                        }
                      />
                    </View>
                  )}
                  {resource === 'communities' && (
                    <View style={{ marginTop: 12, gap: 8 }}>
                      <Button
                        title="Create USD payout from settled earnings"
                        variant="outline"
                        onPress={() =>
                          run(async () => {
                            const p = await post('/admin/payouts', {
                              communityId: row.id,
                              currency: 'USD',
                            });
                            await invalidate();
                            say(
                              `Payout created: ${money(p.amount_minor, 'USD')}. Record the transfer when paid.`,
                            );
                          })
                        }
                      />
                      <Button
                        title="View community"
                        variant="outline"
                        onPress={() => navigation.navigate('Community', { id: row.id })}
                      />
                    </View>
                  )}
                  {resource === 'payouts' && row.status === 'pending' && (
                    <Button
                      title="Record completed bank transfer"
                      variant="outline"
                      onPress={() =>
                        execute(
                          `/admin/payouts/${row.id}/record-transfer`,
                          {},
                          'Only record a transfer after funds have been sent. Provide the bank/provider reference.',
                        )
                      }
                      style={{ marginTop: 12 }}
                    />
                  )}
                </View>
              ))}
            </QueryState>
            <View style={[S.between, { marginTop: 22 }]}>
              {offset > 0 && (
                <Button
                  title="Previous"
                  variant="outline"
                  onPress={() => setOffset(Math.max(0, offset - 100))}
                />
              )}{' '}
              {q.data?.length === 100 && (
                <Button
                  title="Next 100"
                  variant="outline"
                  onPress={() => setOffset(offset + 100)}
                />
              )}
            </View>
            {resource === 'xp' && <XPForm />}
            {resource === 'notifications' && <CampaignForm />}
          </View>
        )}
      </Page>
    </View>
  );
}
function XPForm() {
  const [userId, setUserId] = useState(''),
    [points, setPoints] = useState(''),
    [reason, setReason] = useState(''),
    [key, setKey] = useState(uid);
  const { busy, run } = useAction();
  const { say } = useSession();
  return (
    <View style={[S.card, { marginTop: 23 }]}>
      <Heading style={{ fontSize: 30, marginBottom: 17 }}>AUDITED XP ADJUSTMENT</Heading>
      <Field label="User UUID" value={userId} onChange={setUserId} />
      <Field label="Points (negative to reverse)" value={points} onChange={setPoints} />
      <Field label="Reason" value={reason} onChange={setReason} multiline />
      <Button
        title="Append XP adjustment"
        loading={busy}
        onPress={() =>
          run(async () => {
            await post('/admin/xp', { userId, points: Number(points), reason, key });
            setKey(uid());
            setReason('');
            await invalidate();
            say('XP adjustment recorded.');
          })
        }
      />
    </View>
  );
}
function CampaignForm() {
  const [users, setUsers] = useState(''),
    [title, setTitle] = useState(''),
    [body, setBody] = useState('');
  const { busy, run } = useAction();
  const { say } = useSession();
  return (
    <View style={[S.card, { marginTop: 23 }]}>
      <Heading style={{ fontSize: 30, marginBottom: 17 }}>NOTIFICATION CAMPAIGN</Heading>
      <Field label="Recipient UUIDs, comma separated" value={users} onChange={setUsers} multiline />
      <Field label="Title" value={title} onChange={setTitle} />
      <Field label="Message" value={body} onChange={setBody} multiline />
      <Button
        title="Send campaign"
        loading={busy}
        onPress={() =>
          run(async () => {
            await post('/admin/campaign', {
              userIds: users
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean),
              title,
              body,
            });
            setBody('');
            await invalidate();
            say('Campaign queued for delivery.');
          })
        }
      />
    </View>
  );
}
