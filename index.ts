import './src/observability/initialize';
import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';

import App from './App';

registerRootComponent(Sentry.wrap(App));
