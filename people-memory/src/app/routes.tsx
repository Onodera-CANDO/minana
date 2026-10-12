import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { HomePage } from '../pages/HomePage';
import { PersonListPage } from '../pages/PersonListPage';
import { PersonFormPage } from '../pages/PersonFormPage';
import { PersonDetailPage } from '../pages/PersonDetailPage';
import { ImportPage } from '../pages/ImportPage';
import { ImportResultPage } from '../pages/ImportResultPage';
import { CameraPage } from '../pages/CameraPage';
import { FaceRegisterPage } from '../pages/FaceRegisterPage';
import { MeetingFormPage } from '../pages/MeetingFormPage';
import { MeetingListPage } from '../pages/MeetingListPage';
import { RelationFormPage } from '../pages/RelationFormPage';
import { SettingsPage } from '../pages/SettingsPage';
import { BackupPage } from '../pages/BackupPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="camera" element={<CameraPage />} />
        <Route path="people" element={<PersonListPage />} />
        <Route path="people/new" element={<PersonFormPage />} />
        <Route path="people/:id" element={<PersonDetailPage />} />
        <Route path="people/:id/edit" element={<PersonFormPage />} />
        <Route path="people/:id/face" element={<FaceRegisterPage />} />
        <Route path="people/:id/relations/new" element={<RelationFormPage />} />
        <Route path="meetings" element={<MeetingListPage />} />
        <Route path="meetings/new" element={<MeetingFormPage />} />
        <Route path="meetings/:id/edit" element={<MeetingFormPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="import/:batchId" element={<ImportResultPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/backup" element={<BackupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
