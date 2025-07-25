import { ESLint } from "eslint";
import plugin from "../src/index.js";
import { js } from "./rule-tester.js";
import assert from "assert";

// Sanity check that runs the recommended config
// on common + valid real-world code, as opposed to contrived test cases.
describe("recommended rules on real-world code", () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [plugin.configs.recommended],
  });

  describe("should not flag", () => {
    [
      {
        name: "Managing a timer",
        code: js`
        function Timer() {
          const [seconds, setSeconds] = useState(0);

          useEffect(() => {
            const interval = setInterval(() => {
              setSeconds((s) => s + 1);
            }, 1000);

            return () => { 
              clearInterval(interval); 
            }
          }, []);

          return <div>{seconds}</div>;
        }
      `,
      },
      {
        name: "Debouncing",
        code: js`
        function useDebouncedState(value, delay) {
          const [state, setState] = useState(value);
          const [debouncedState, setDebouncedState] = useState(value);

          useEffect(() => {
            const timeout = setTimeout(() => {
              setDebouncedState(state);
            }, delay);

            return () => {
              clearTimeout(timeout);
            };
          }, [delay, state]);

          return [state, debouncedState, setState];
        }
      `,
      },
      {
        name: "Listening for window events",
        code: js`
        function WindowSize() {
          const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

          useEffect(() => {
            const handleResize = () => {
              setSize({ width: window.innerWidth, height: window.innerHeight });
            };

            window.addEventListener('resize', handleResize);

            return () => {
              window.removeEventListener('resize', handleResize);
            };
          }, []);

          return <div>{size.width} x {size.height}</div>;
        }
      `,
      },
      {
        // https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/issues/24
        // TODO: Should we follow `contentRef.current` being passed as `element`, which is used for then derived state?
        // If we do, this particular case shouldn't be flagged anyway, because the function passed to `ResizeObserver` is really a callback.
        // Which I think isDirectCall should filter out?
        name: "ResizeObserver",
        code: js`
          function useHasOverflow({ contentRef, maxHeight }) {
            const [hasOverflow, setHasOverflow] = useState(false);

            useEffect(() => {
              const resizeObserver = new ResizeObserver((element) => {
                const hasContentOverflow = element.scrollHeight > maxHeight;
                setHasOverflow(hasContentOverflow);
              })

              if (contentRef.current != null) {
                resizeObserver.observe(contentRef.current);
              }

              return () => {
                resizeObserver.disconnect();
              };
            }, [contentRef, maxHeight]);

            return hasOverflow;
          }
        `,
      },
      {
        name: "Play/pausing DOM video",
        code: js`
        function VideoPlayer() {
          const [isPlaying, setIsPlaying] = useState(false);
          const videoRef = useRef();

          useEffect(() => {
            if (isPlaying) {
              videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          }, [isPlaying]);

          return <div>
            <video ref={videoRef} />
            <button onClick={() => setIsPlaying((p) => !p)} />
          </div>
        }
      `,
      },
      {
        name: "Saving to LocalStorage",
        code: js`
        function Notes() {
          const [notes, setNotes] = useState(() => {
            const savedNotes = localStorage.getItem('notes');
            return savedNotes ? JSON.parse(savedNotes) : [];
          });

          useEffect(() => {
            localStorage.setItem('notes', JSON.stringify(notes));
          }, [notes]);

          return <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        }
      `,
      },
      {
        name: "Logging/Analytics",
        code: js`
        function Nav() {
          const [page, setPage] = useState('home');

          useEffect(() => {
            console.log("page viewed", page);
          }, [page]);

          return (
            <div>
              <button onClick={() => setPage('home')}>Home</button>
              <button onClick={() => setPage('about')}>About</button>
              <div>{page}</div>
            </div>
          )
        }
      `,
      },
      {
        name: "JSON.stringifying in deps",
        code: js`
        function Feed() {
          const [posts, setPosts] = useState([]);
          const [scrollPosition, setScrollPosition] = useState(0);

          useEffect(() => {
            setScrollPosition(0);
          }, [JSON.stringify(posts)]);
        }
      `,
      },
      {
        name: "CountryPicker",
        code: js`
        function CountryPicker({ withEmoji }) {
          const { translation, getCountries } = useContext();

          const [state, setState] = useState({
            countries: [],
            selectedCountry: null,
          });
          const setCountries = (countries) => setState({ ...state, countries });

          useEffect(() => {
            let cancel = false;
            getCountries(translation)
              .then((countries) => (cancel ? null : setCountries(countries)))
              .catch(console.warn);

            return () => {
              cancel = true;
            };
          }, [translation, withEmoji]);
        }
      `,
      },
      {
        name: "navigation.setOptions",
        code: js`
        import { useNavigation } from '@react-navigation/native';
        import { useState, useLayoutEffect } from 'react';

        function ProfileScreen({ route }) {
          const navigation = useNavigation();
          const [value, onChangeText] = React.useState(route.params.title);

          React.useLayoutEffect(() => {
            navigation.setOptions({
              title: value === '' ? 'No title' : value,
            });
          }, [navigation, route]);
        }
      `,
      },
      {
        name: "Keyboard state listener",
        code: js`
        import { useEffect, useState } from 'react';
        import keyboardReducer from './reducers';

        let globalKeyboardState = {
          recentlyUsed: []
        };

        export const keyboardStateListeners = new Set();

        const setKeyboardState = (action) => {
          globalKeyboardState = keyboardReducer(globalKeyboardState, action);
          keyboardStateListeners.forEach((listener) => listener(globalKeyboardState));
        };

        export const useKeyboardStore = () => {
          const [keyboardState, setState] = useState(globalKeyboardState);

          useEffect(() => {
            const listener = () => setState(globalKeyboardState);
            keyboardStateListeners.add(listener);
            return () => {
              keyboardStateListeners.delete(listener);
            };
          }, [keyboardState]);

          return { keyboardState, setKeyboardState };
        };

        useKeyboardStore.setKeyboardState = setKeyboardState;
      `,
      },
    ].forEach(({ name, code }) => {
      it(name, async () => {
        const results = await eslint.lintText(code);
        const messages = results[0].messages;
        assert.strictEqual(
          messages.length,
          0,
          `Expected no lint errors for: ${name}, but got: ${JSON.stringify(messages)}`,
        );
      });
    });
  });
});
