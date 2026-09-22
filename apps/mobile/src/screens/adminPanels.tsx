import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { invalidate, post, request, useAction, useData, useSession } from '../api';
import { foodCatalog, FoodCatalog, FoodItem, FoodStore } from '../foodCatalog';
import { tint } from '../theme';
import {
  Button,
  C,
  Chip,
  Chips,
  Field,
  Heading,
  Label,
  QueryState,
  S,
  SectionTitle,
  T,
  Toggle,
} from '../ui';

// The parts of the admin panel that are not a plain database table: the food catalogue,
// who may administer the site, and email written by hand. Each one talks to /admin/*
// and every call it makes is audited on the server.

const rowStyle = { marginTop: 14 } as const;

function Confirm({
  title,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <View style={[S.card, { marginTop: 14, borderWidth: 1, borderColor: C.error }]}>
      <T style={{ color: C.white, marginBottom: 13 }}>{title}</T>
      <Button title="Yes, do it" loading={busy} onPress={onConfirm} />
      <Button title="Cancel" variant="outline" onPress={onCancel} style={{ marginTop: 8 }} />
    </View>
  );
}

/** The dishes and places the Food tab shows, editable and deletable. */
export function FoodPanel() {
  const q = useData<FoodCatalog>('/admin/food');
  const { busy, run } = useAction();
  const { say } = useSession();
  const [search, setSearch] = useState('');
  const [store, setStore] = useState('all');
  const [editing, setEditing] = useState<FoodItem | null>(null);
  const [removing, setRemoving] = useState<FoodItem | null>(null);
  const [storeEditing, setStoreEditing] = useState<FoodStore | null>(null);

  const stores = q.data?.stores ?? [];
  const items = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (q.data?.items ?? []).filter(
      (item) =>
        (store === 'all' || item.storeId === store) &&
        (!needle || `${item.name} ${item.category}`.toLowerCase().includes(needle)),
    );
  }, [q.data, search, store]);

  const save = (item: FoodItem) =>
    run(async () => {
      await request('/admin/food/items', { method: 'PUT', body: JSON.stringify(item) });
      setEditing(null);
      await invalidate();
      say('Dish saved.');
    });

  const empty = !q.data?.items.length;
  return (
    <View style={{ marginTop: 20 }}>
      <View style={S.between}>
        <Heading style={{ fontSize: 29 }}>FOOD</Heading>
        <Button
          title="Add dish"
          variant="white"
          style={{ minHeight: 41 }}
          onPress={() =>
            setEditing({
              id: `dish-${Date.now().toString(36)}`,
              storeId: store === 'all' ? stores[0]?.id : store,
              name: '',
              category: '',
              imageUrl: null,
              sourceUrl: '',
              priceLabel: null,
              calories: null,
              proteinGrams: null,
              nutritionBasis: null,
            } as FoodItem)
          }
        />
      </View>
      <T style={{ fontSize: 11, marginTop: 8 }}>
        {empty
          ? 'The catalogue is empty, so the app is showing the menus bundled with it. Import them once to take over.'
          : `${q.data?.stores.length} places · ${q.data?.items.length} dishes live in the app.`}
      </T>
      <Button
        title={empty ? 'Import the bundled menus' : 'Re-import the bundled menus'}
        variant="outline"
        loading={busy}
        style={{ marginTop: 12 }}
        onPress={() =>
          run(async () => {
            const result = await post('/admin/food/import', {
              stores: foodCatalog.stores.map((s) => ({ ...s, enabled: true })),
              items: foodCatalog.items.map((i) => ({ ...i, enabled: true })),
              replace: false,
            });
            await invalidate();
            say(`Imported ${result.items} dishes from ${result.stores} places.`);
          })
        }
      />

      <Chips>
        <Chip title="all" active={store === 'all'} onPress={() => setStore('all')} />
        {stores.map((s) => (
          <Chip key={s.id} title={s.name} active={store === s.id} onPress={() => setStore(s.id)} />
        ))}
      </Chips>
      <Field label="Search dishes" value={search} onChange={setSearch} />
      {store !== 'all' && (
        <Button
          title="Edit this place"
          variant="outline"
          style={{ marginBottom: 14 }}
          onPress={() => setStoreEditing(stores.find((s) => s.id === store) || null)}
        />
      )}

      {storeEditing && (
        <View style={[S.card, rowStyle]}>
          <SectionTitle title="PLACE" />
          <Field
            label="name"
            value={storeEditing.name}
            onChange={(v: string) => setStoreEditing({ ...storeEditing, name: v })}
          />
          <Field
            label="area"
            value={storeEditing.area}
            onChange={(v: string) => setStoreEditing({ ...storeEditing, area: v })}
          />
          <Field
            label="specialty"
            value={storeEditing.specialty}
            onChange={(v: string) => setStoreEditing({ ...storeEditing, specialty: v })}
          />
          <Button
            title="Save place"
            loading={busy}
            onPress={() =>
              run(async () => {
                await request('/admin/food/stores', {
                  method: 'PUT',
                  body: JSON.stringify({ ...storeEditing, enabled: true }),
                });
                setStoreEditing(null);
                await invalidate();
                say('Place saved.');
              })
            }
          />
          <Button
            title="Delete the place and its dishes"
            variant="outline"
            style={{ marginTop: 8 }}
            onPress={() =>
              run(async () => {
                await request(`/admin/food/stores/${storeEditing.id}`, { method: 'DELETE' });
                setStoreEditing(null);
                setStore('all');
                await invalidate();
                say('Place removed.');
              })
            }
          />
          <Button
            title="Close"
            variant="outline"
            style={{ marginTop: 8 }}
            onPress={() => setStoreEditing(null)}
          />
        </View>
      )}

      {editing && (
        <View style={[S.card, rowStyle]}>
          <SectionTitle title="DISH" />
          {(
            [
              ['name', 'name'],
              ['category', 'category'],
              ['priceLabel', 'price label'],
              ['calories', 'calories'],
              ['proteinGrams', 'protein (g)'],
              ['imageUrl', 'image URL'],
              ['sourceUrl', 'menu URL'],
              ['nutritionBasis', 'nutrition basis'],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={
                editing[key] === null || editing[key] === undefined ? '' : String(editing[key])
              }
              onChange={(v: string) =>
                setEditing({
                  ...editing,
                  [key]:
                    key === 'calories' || key === 'proteinGrams'
                      ? v.trim()
                        ? Number(v)
                        : null
                      : key === 'name' || key === 'category' || key === 'sourceUrl'
                        ? v
                        : v.trim() || null,
                })
              }
            />
          ))}
          <Label style={{ marginTop: 6 }}>PLACE</Label>
          <Chips>
            {stores.map((s) => (
              <Chip
                key={s.id}
                title={s.name}
                active={editing.storeId === s.id}
                onPress={() => setEditing({ ...editing, storeId: s.id })}
              />
            ))}
          </Chips>
          <Button title="Save dish" loading={busy} onPress={() => save(editing)} />
          <Button
            title="Close"
            variant="outline"
            style={{ marginTop: 8 }}
            onPress={() => setEditing(null)}
          />
        </View>
      )}

      {removing && (
        <Confirm
          title={`Delete "${removing.name}" from the app for everyone?`}
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            run(async () => {
              await request(`/admin/food/items/${removing.id}`, { method: 'DELETE' });
              setRemoving(null);
              await invalidate();
              say('Dish deleted.');
            })
          }
        />
      )}

      <QueryState query={q}>
        {items.slice(0, 200).map((item) => (
          <View key={item.id} style={[S.card, rowStyle]}>
            <View style={S.between}>
              <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13, flex: 1 }}>
                {item.name}
              </T>
              {!(item as any).enabled && <Label style={{ fontSize: 8 }}>HIDDEN</Label>}
            </View>
            <T style={{ fontSize: 10, color: tint('#CED2DA'), marginTop: 6 }}>
              {[
                stores.find((s) => s.id === item.storeId)?.name || item.storeId,
                item.category,
                item.priceLabel,
                item.calories ? `${item.calories} kcal` : null,
                item.proteinGrams ? `${item.proteinGrams} g protein` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </T>
            <View style={[S.row, { gap: 8, marginTop: 11 }]}>
              <Button
                title="Edit"
                variant="outline"
                style={{ flex: 1, minHeight: 40 }}
                onPress={() => setEditing(item)}
              />
              <Button
                title={(item as any).enabled === false ? 'Show' : 'Hide'}
                variant="outline"
                style={{ flex: 1, minHeight: 40 }}
                onPress={() =>
                  run(async () => {
                    await request('/admin/food/items', {
                      method: 'PUT',
                      body: JSON.stringify({ ...item, enabled: (item as any).enabled === false }),
                    });
                    await invalidate();
                  })
                }
              />
              <Button
                title="Delete"
                variant="outline"
                style={{ flex: 1, minHeight: 40 }}
                onPress={() => setRemoving(item)}
              />
            </View>
          </View>
        ))}
      </QueryState>
    </View>
  );
}

/** Everyone with a CRW+ account: find them, invite new ones, change what they may do. */
export function MembersPanel() {
  const { busy, run } = useAction();
  const { say, user } = useSession();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'admins' | 'organizers' | 'suspended'>('all');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    email: '',
    displayName: '',
    admin: false,
    organizer: false,
  });
  const [removing, setRemoving] = useState<any>(null);
  const [reason, setReason] = useState('');
  const q = useData<any[]>(
    `/admin/members?filter=${filter}&query=${encodeURIComponent(search.trim())}`,
  );

  const add = () =>
    run(async () => {
      await post('/admin/members', {
        email: draft.email.trim().toLowerCase(),
        displayName: draft.displayName.trim(),
        roles: [...(draft.admin ? ['ADMIN'] : []), ...(draft.organizer ? ['ORGANIZER'] : [])],
      });
      setDraft({ email: '', displayName: '', admin: false, organizer: false });
      setAdding(false);
      await invalidate();
      say('Account created. They have an email with a link to choose a password.');
    });

  const role = (person: any, which: 'ADMIN' | 'ORGANIZER') =>
    run(async () => {
      await post('/admin/people/role', {
        email: person.email,
        role: which,
        grant: !person.roles.includes(which),
      });
      await invalidate();
    });

  const status = (person: any) =>
    run(async () => {
      await post(`/admin/users/${person.id}/status`, {
        status: person.status === 'active' ? 'suspended' : 'active',
        reason: 'Changed from the admin panel',
      });
      await invalidate();
      say(person.status === 'active' ? 'Account suspended.' : 'Account restored.');
    });

  return (
    <View style={{ marginTop: 20 }}>
      <View style={S.between}>
        <Heading style={{ fontSize: 29 }}>MEMBERS</Heading>
        <Button
          title={adding ? 'Close' : 'Add member'}
          variant="white"
          style={{ minHeight: 41 }}
          onPress={() => setAdding(!adding)}
        />
      </View>
      <T style={{ fontSize: 11, marginTop: 8 }}>
        Everyone with an account. A new member gets an email with a link to choose their own
        password, so nobody here ever handles one.
      </T>

      {adding && (
        <View style={[S.card, rowStyle]}>
          <SectionTitle title="NEW MEMBER" />
          <Field
            label="Email address"
            value={draft.email}
            onChange={(v: string) => setDraft({ ...draft, email: v })}
          />
          <Field
            label="Name"
            value={draft.displayName}
            onChange={(v: string) => setDraft({ ...draft, displayName: v })}
          />
          <Toggle
            title="Administrator"
            description="Can manage the whole platform, including other members."
            value={draft.admin}
            onChange={(v: boolean) => setDraft({ ...draft, admin: v })}
          />
          <Toggle
            title="Organizer"
            description="Can publish and run activities."
            value={draft.organizer}
            onChange={(v: boolean) => setDraft({ ...draft, organizer: v })}
          />
          <Button title="Create the account and send the invitation" loading={busy} onPress={add} />
        </View>
      )}

      <Chips>
        {(
          [
            ['all', 'everyone'],
            ['admins', 'admins'],
            ['organizers', 'organizers'],
            ['suspended', 'suspended'],
          ] as const
        ).map(([key, label]) => (
          <Chip key={key} title={label} active={filter === key} onPress={() => setFilter(key)} />
        ))}
      </Chips>
      <Field label="Search by name or email" value={search} onChange={setSearch} />

      {removing && (
        <View style={[S.card, rowStyle, { borderWidth: 1, borderColor: C.error }]}>
          <T style={{ color: C.white, marginBottom: 13 }}>
            {`Erase ${removing.email} for good? Their workouts, routes and health data go with the account, and this cannot be undone.`}
          </T>
          <Field
            label="Why (at least 5 characters, kept in the audit log)"
            value={reason}
            onChange={setReason}
            multiline
          />
          <Button
            title="Delete this member"
            loading={busy}
            disabled={reason.trim().length < 5}
            onPress={() =>
              run(async () => {
                await request(`/admin/users/${removing.id}`, {
                  method: 'DELETE',
                  body: JSON.stringify({ reason }),
                });
                setRemoving(null);
                setReason('');
                await invalidate();
                say('Member deleted.');
              })
            }
          />
          <Button
            title="Cancel"
            variant="outline"
            style={{ marginTop: 8 }}
            onPress={() => setRemoving(null)}
          />
        </View>
      )}

      <QueryState query={q}>
        {q.data?.map((person) => {
          const self = person.id === user?.id;
          return (
            <View key={person.id} style={[S.card, rowStyle]}>
              <View style={S.between}>
                <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13, flex: 1 }}>
                  {person.display_name || person.email}
                  {self ? ' (you)' : ''}
                </T>
                <Label style={{ color: C.blue, fontSize: 8 }}>
                  {person.roles.filter((r: string) => r !== 'USER').join(' · ') || 'MEMBER'}
                </Label>
              </View>
              <T selectable style={{ fontSize: 10, color: tint('#CED2DA'), marginTop: 6 }}>
                {person.email}
              </T>
              <T style={{ fontSize: 10, marginTop: 4 }}>
                {[
                  person.status,
                  person.verified ? 'email verified' : 'not verified',
                  `joined ${new Date(person.created_at).toLocaleDateString('en-GB')}`,
                ].join(' · ')}
              </T>
              <View style={[S.row, { gap: 8, marginTop: 11, flexWrap: 'wrap' }]}>
                <Button
                  title={person.roles.includes('ADMIN') ? 'Remove admin' : 'Make admin'}
                  variant="outline"
                  style={{ flexGrow: 1, minHeight: 40 }}
                  onPress={() => role(person, 'ADMIN')}
                />
                <Button
                  title={person.roles.includes('ORGANIZER') ? 'Remove organizer' : 'Make organizer'}
                  variant="outline"
                  style={{ flexGrow: 1, minHeight: 40 }}
                  onPress={() => role(person, 'ORGANIZER')}
                />
              </View>
              {!self && (
                <View style={[S.row, { gap: 8, marginTop: 8 }]}>
                  <Button
                    title={person.status === 'active' ? 'Suspend' : 'Restore'}
                    variant="outline"
                    style={{ flex: 1, minHeight: 40 }}
                    onPress={() => status(person)}
                  />
                  <Button
                    title="Send invitation again"
                    variant="outline"
                    style={{ flex: 1, minHeight: 40 }}
                    onPress={() =>
                      run(async () => {
                        await post(`/admin/members/${person.id}/invite`);
                        say('Invitation sent.');
                      })
                    }
                  />
                  <Button
                    title="Delete"
                    variant="outline"
                    style={{ flex: 1, minHeight: 40 }}
                    onPress={() => setRemoving(person)}
                  />
                </View>
              )}
            </View>
          );
        })}
      </QueryState>
    </View>
  );
}

/** Who administers the site: the people with the ADMIN or ORGANIZER role. */
export function TeamPanel() {
  const q = useData<any[]>('/admin/people');
  const { busy, run } = useAction();
  const { say } = useSession();
  const { user } = useSession();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'ORGANIZER'>('ADMIN');

  const change = (address: string, which: 'ADMIN' | 'ORGANIZER', grant: boolean) =>
    run(async () => {
      await post('/admin/people/role', { email: address, role: which, grant });
      setEmail('');
      await invalidate();
      say(grant ? `${address} is now ${which}.` : `${which} taken away from ${address}.`);
    });

  return (
    <View style={{ marginTop: 20 }}>
      <Heading style={{ fontSize: 29 }}>TEAM</Heading>
      <T style={{ fontSize: 11, marginTop: 8 }}>
        An administrator can manage every part of the platform. The person needs a CRW+ account
        first: add them by the address they signed up with.
      </T>
      <View style={[S.card, rowStyle]}>
        <Field label="Email address" value={email} onChange={setEmail} />
        <Chips>
          <Chip title="admin" active={role === 'ADMIN'} onPress={() => setRole('ADMIN')} />
          <Chip
            title="organizer"
            active={role === 'ORGANIZER'}
            onPress={() => setRole('ORGANIZER')}
          />
        </Chips>
        <Button
          title={`Give the ${role.toLowerCase()} role`}
          loading={busy}
          onPress={() => change(email.trim().toLowerCase(), role, true)}
        />
      </View>
      <QueryState query={q}>
        {q.data?.map((person) => (
          <View key={person.id} style={[S.card, rowStyle]}>
            <View style={S.between}>
              <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13, flex: 1 }}>
                {person.display_name || person.email}
              </T>
              <Label style={{ color: C.blue, fontSize: 8 }}>{person.roles.join(' · ')}</Label>
            </View>
            <T selectable style={{ fontSize: 10, color: tint('#CED2DA'), marginTop: 6 }}>
              {person.email}
            </T>
            <View style={[S.row, { gap: 8, marginTop: 11 }]}>
              {(['ADMIN', 'ORGANIZER'] as const)
                .filter((r) => person.roles.includes(r))
                .map((r) => (
                  <Button
                    key={r}
                    title={`Take ${r.toLowerCase()} away`}
                    variant="outline"
                    style={{ flex: 1, minHeight: 40 }}
                    onPress={() => change(person.email, r, false)}
                  />
                ))}
            </View>
            {person.id === user?.id && <T style={{ fontSize: 10, marginTop: 8 }}>This is you.</T>}
          </View>
        ))}
      </QueryState>
    </View>
  );
}

/** Email written here and delivered through the same provider as every other message. */
export function EmailPanel() {
  const { busy, run } = useAction();
  const { say } = useSession();
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'selected' | 'marketing' | 'all'>('selected');
  const [ids, setIds] = useState('');

  const ready = subject.trim().length >= 2 && body.trim().length >= 2;

  const send = (test: boolean) =>
    run(async () => {
      const result = await post('/admin/email', {
        subject,
        heading: heading.trim() || undefined,
        body,
        audience,
        userIds: ids
          .split(/[,\s]+/)
          .map((v) => v.trim())
          .filter(Boolean),
        test,
      });
      say(
        test
          ? 'Test sent to your own address.'
          : `Queued for ${result.recipients} ${result.recipients === 1 ? 'person' : 'people'}.`,
      );
    });

  return (
    <View style={{ marginTop: 20 }}>
      <Heading style={{ fontSize: 29 }}>EMAIL</Heading>
      <T style={{ fontSize: 11, marginTop: 8 }}>
        Written here, sent through Resend with the CRW+ layout. Blank lines become paragraphs.
        Marketing reaches only the people who opted in.
      </T>
      <View style={[S.card, rowStyle]}>
        <Field label="Subject" value={subject} onChange={setSubject} />
        <Field label="Headline (optional)" value={heading} onChange={setHeading} />
        <Field label="Message" value={body} onChange={setBody} multiline />
        <Label style={{ marginTop: 6 }}>WHO GETS IT</Label>
        <Chips>
          <Chip
            title="chosen people"
            active={audience === 'selected'}
            onPress={() => setAudience('selected')}
          />
          <Chip
            title="marketing opt-in"
            active={audience === 'marketing'}
            onPress={() => setAudience('marketing')}
          />
          <Chip
            title="every account"
            active={audience === 'all'}
            onPress={() => setAudience('all')}
          />
        </Chips>
        {audience === 'selected' && (
          <Field label="Recipient UUIDs, comma separated" value={ids} onChange={setIds} multiline />
        )}
        <Button
          title="Send a test to myself"
          variant="outline"
          disabled={!ready}
          onPress={() => send(true)}
        />
        <Button
          title="Send it"
          loading={busy}
          disabled={!ready}
          style={{ marginTop: 9 }}
          onPress={() => send(false)}
        />
        {!ready && (
          <T style={{ fontSize: 10, marginTop: 8 }}>
            A subject and a message of at least two characters, please.
          </T>
        )}
      </View>
    </View>
  );
}
