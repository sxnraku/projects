import Constants from 'expo-constants';

/**
 * True quando a app corre dentro do Expo Go (cliente da loja), que NÃO inclui
 * módulos nativos personalizados como o AdMob. Nesse ambiente saltamos tudo o
 * que seja nativo de anúncios para o jogo correr sem crashar — útil para testar
 * gameplay/UI no telemóvel sem fazer um development build.
 */
export const isExpoGo = Constants.executionEnvironment === 'storeClient';
