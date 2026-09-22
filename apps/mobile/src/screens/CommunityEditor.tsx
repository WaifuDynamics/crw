import React, { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAction, useSession, post, patch, invalidate } from '../api';
import { S, Header, Page, Field, Button } from '../ui';
export default function CommunityEditor({ route, navigation }: any) {
  const co = route.params.community;
  const [form, setForm] = useState({
    name: co.name,
    description: co.description,
    coverUrl: co.cover_url || '',
    logoUrl: co.logo_url || '',
  });
  const { busy, run } = useAction();
  const { say } = useSession();
  const upload = (key: 'coverUrl' | 'logoUrl') =>
    run(async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0],
        blob = await (await fetch(asset.uri)).blob(),
        contentType = asset.mimeType || 'image/jpeg';
      const signed = await post('/uploads/presign', {
        purpose: 'community',
        contentType,
        size: blob.size,
      });
      const response = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      });
      if (!response.ok) throw new Error('Upload failed');
      setForm({ ...form, [key]: signed.mediaUrl });
    });
  return (
    <View style={S.page}>
      <Header title="YOUR COMMUNITY" onBack={navigation.goBack} />
      <Page style={{ paddingTop: 22 }}>
        <Field
          label="Community name"
          value={form.name}
          onChange={(name: string) => setForm({ ...form, name })}
        />
        <Field
          label="Community story"
          multiline
          value={form.description}
          onChange={(description: string) => setForm({ ...form, description })}
        />
        <Button
          title="Upload cover photo"
          variant="outline"
          onPress={() => upload('coverUrl')}
          style={{ marginBottom: 15 }}
        />
        <Field
          label="Cover image URL"
          value={form.coverUrl}
          onChange={(coverUrl: string) => setForm({ ...form, coverUrl })}
        />
        <Button
          title="Upload community logo"
          variant="outline"
          onPress={() => upload('logoUrl')}
          style={{ marginBottom: 15 }}
        />
        <Field
          label="Logo image URL"
          value={form.logoUrl}
          onChange={(logoUrl: string) => setForm({ ...form, logoUrl })}
        />
        <Button
          title="Save community"
          loading={busy}
          onPress={() =>
            run(async () => {
              await patch(`/organizer/communities/${co.id}`, {
                ...form,
                coverUrl: form.coverUrl || null,
                logoUrl: form.logoUrl || null,
              });
              await invalidate();
              say('Your community is updated.');
              navigation.goBack();
            })
          }
        />
      </Page>
    </View>
  );
}
