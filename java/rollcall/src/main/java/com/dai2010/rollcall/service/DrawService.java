package com.dai2010.rollcall.service;

import com.dai2010.rollcall.model.Person;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

/** Implements single and grouped random draws. */
public final class DrawService {
    private final Random random;

    public DrawService() {
        this(new Random());
    }

    public DrawService(Random random) {
        this.random = random == null ? new Random() : random;
    }

    public DrawResult draw(List<Person> people, int count, boolean continuous, Set<Integer> drawnIds) {
        validatePeople(people);
        validateCount(count, people.size());
        Set<Integer> state = drawnIds == null ? new LinkedHashSet<>() : drawnIds;
        List<Person> available = new ArrayList<>();
        if (continuous) {
            for (Person person : people) {
                if (!state.contains(person.getId())) {
                    available.add(person);
                }
            }
            if (count > available.size()) {
                throw new InsufficientPeopleException(count, available.size());
            }
        } else {
            available.addAll(people);
        }
        Collections.shuffle(available, random);
        List<Person> selected = new ArrayList<>(available.subList(0, count));
        if (continuous) {
            selected.forEach(person -> state.add(person.getId()));
        }
        int remaining = continuous ? people.size() - state.size() : people.size();
        return new DrawResult(selected, remaining, people.size());
    }

    public List<List<Person>> drawGroups(
            List<Person> people,
            int perGroup,
            int groupCount,
            boolean continuous,
            Set<Integer> drawnIds) {
        validatePeople(people);
        validateCount(perGroup, people.size());
        if (groupCount <= 0) {
            throw new IllegalArgumentException("组数必须大于 0");
        }
        long requested = (long) perGroup * groupCount;
        if (continuous && requested > people.size()) {
            throw new InsufficientPeopleException((int) Math.min(requested, Integer.MAX_VALUE), people.size());
        }
        Set<Integer> original = drawnIds == null ? new LinkedHashSet<>() : drawnIds;
        Set<Integer> working = new LinkedHashSet<>(original);
        List<List<Person>> groups = new ArrayList<>();
        for (int index = 0; index < groupCount; index++) {
            List<Person> group = draw(people, perGroup, continuous, working).selected();
            groups.add(group);
        }
        if (continuous) {
            original.clear();
            original.addAll(working);
        }
        return groups;
    }

    private static void validatePeople(List<Person> people) {
        if (people == null || people.isEmpty()) {
            throw new IllegalArgumentException("名单为空，请先添加名单成员");
        }
    }

    private static void validateCount(int count, int total) {
        if (count <= 0) {
            throw new IllegalArgumentException("每组人数必须大于 0");
        }
        if (count > total) {
            throw new IllegalArgumentException("每组人数不能超过名单总人数");
        }
    }

    public record DrawResult(List<Person> selected, int remaining, int total) {
        public DrawResult {
            selected = List.copyOf(selected);
        }
    }

    public static final class InsufficientPeopleException extends IllegalArgumentException {
        private final int requested;
        private final int available;

        public InsufficientPeopleException(int requested, int available) {
            super("连续抽取时剩余人数不足：需要 " + requested + " 人，当前仅剩 " + available + " 人");
            this.requested = requested;
            this.available = available;
        }

        public int requested() {
            return requested;
        }

        public int available() {
            return available;
        }
    }
}
